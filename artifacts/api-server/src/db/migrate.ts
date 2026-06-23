import pool from './connection';

async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    // states — no foreign keys
    await client.query(`
      CREATE TABLE IF NOT EXISTS states (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name       VARCHAR(100) NOT NULL,
        code       VARCHAR(10)  UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: states');

    // stakeholders — UNIQUE(name) for idempotent seeding
    await client.query(`
      CREATE TABLE IF NOT EXISTS stakeholders (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        is_active   BOOLEAN DEFAULT true,
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: stakeholders');

    // users — polymorphic entity_id (states or stakeholders)
    // Valid role values: super_admin | state_admin | trip_admin | stakeholder
    // Deprecated (no longer valid): admin, driver
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email         VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role          VARCHAR(50) NOT NULL,
        entity_type   VARCHAR(50),
        entity_id     UUID,
        is_active     BOOLEAN DEFAULT true,
        deleted_at    TIMESTAMP,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: users');

    // pricing_charts — reusable rate schedule; amounts in kobo
    await client.query(`
      CREATE TABLE IF NOT EXISTS pricing_charts (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        loading_fee     INTEGER NOT NULL,
        unloading_fee   INTEGER NOT NULL,
        is_active       BOOLEAN NOT NULL DEFAULT false,
        created_by      UUID REFERENCES users(id),
        created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: pricing_charts');

    // pricing_chart_stakeholder_rates — per-stakeholder rates for a chart
    await client.query(`
      CREATE TABLE IF NOT EXISTS pricing_chart_stakeholder_rates (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pricing_chart_id UUID NOT NULL REFERENCES pricing_charts(id),
        stakeholder_id   UUID NOT NULL REFERENCES stakeholders(id),
        amount           INTEGER NOT NULL,
        created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE(pricing_chart_id, stakeholder_id)
      )
    `);
    console.log('✓ Table created: pricing_chart_stakeholder_rates');

    // drivers — references users(id) via created_by
    await client.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name      VARCHAR(255) NOT NULL,
        license_number VARCHAR(100) NOT NULL UNIQUE,
        phone_number   VARCHAR(20) NOT NULL,
        created_by     UUID REFERENCES users(id),
        is_active      BOOLEAN NOT NULL DEFAULT true,
        deleted_at     TIMESTAMP WITH TIME ZONE,
        created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: drivers');

    // vehicles — master record keyed by registration number
    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        registration_number VARCHAR(50) NOT NULL UNIQUE,
        created_by          UUID REFERENCES users(id),
        is_active           BOOLEAN NOT NULL DEFAULT true,
        deleted_at          TIMESTAMP WITH TIME ZONE,
        created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: vehicles');

    // trips — references users and states; soft-delete via deleted_at
    await client.query(`
      CREATE TABLE IF NOT EXISTS trips (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_id               UUID REFERENCES users(id),
        loading_state_id        UUID REFERENCES states(id),
        unloading_state_id      UUID REFERENCES states(id),
        origin_description      TEXT,
        destination_description TEXT,
        status                  VARCHAR(50) NOT NULL DEFAULT 'created',
        created_by              UUID REFERENCES users(id),
        deleted_at              TIMESTAMP,
        created_at              TIMESTAMP DEFAULT NOW(),
        updated_at              TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: trips');

    // vehicles ← trips: add vehicle_id FK and backfill from vehicle_number
    await client.query(`
      ALTER TABLE trips
        ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id)
    `);

    // Backfill: only runs when the legacy vehicle_number column is still present
    // (existing databases). On a fresh install the column was never created, so
    // this block is a no-op and vehicle_id is populated at INSERT time instead.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'trips' AND column_name = 'vehicle_number'
        ) THEN
          -- Insert one vehicle row per distinct plate seen in ANY trip
          INSERT INTO vehicles (registration_number, created_by, is_active)
          SELECT DISTINCT ON (vehicle_number)
            vehicle_number,
            created_by,
            true
          FROM trips
          ON CONFLICT (registration_number) DO NOTHING;

          -- Link all trips that still have a NULL vehicle_id
          UPDATE trips t
          SET    vehicle_id = v.id
          FROM   vehicles v
          WHERE  v.registration_number = t.vehicle_number
            AND  t.vehicle_id IS NULL;
        END IF;
      END;
      $$
    `);

    // Enforce the NOT NULL constraint (idempotent — errors if already set, but
    // PostgreSQL silently ignores setting a constraint that is already enforced).
    await client.query(`
      ALTER TABLE trips ALTER COLUMN vehicle_id SET NOT NULL
    `);

    // Drop the now-redundant column (IF EXISTS makes this idempotent).
    await client.query(`
      ALTER TABLE trips DROP COLUMN IF EXISTS vehicle_number
    `);

    console.log('✓ vehicle_id backfill done (if needed), NOT NULL enforced, vehicle_number dropped');

    // trip_fees — amounts stored as INTEGER in kobo, never floats
    await client.query(`
      CREATE TABLE IF NOT EXISTS trip_fees (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id        UUID REFERENCES trips(id),
        recipient_type VARCHAR(50) NOT NULL,
        recipient_id   UUID NOT NULL,
        fee_type       VARCHAR(50) NOT NULL,
        amount         INTEGER NOT NULL,
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: trip_fees');

    // wallets — unique per owner; total_collected in kobo
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_type      VARCHAR(50) NOT NULL,
        owner_id        UUID NOT NULL,
        total_collected INTEGER NOT NULL DEFAULT 0,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW(),
        UNIQUE(owner_type, owner_id)
      )
    `);
    console.log('✓ Table created: wallets');

    // wallet_ledger — positive for credit, negative for reversal
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_ledger (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id   UUID REFERENCES wallets(id),
        trip_id     UUID REFERENCES trips(id),
        trip_fee_id UUID REFERENCES trip_fees(id),
        amount      INTEGER NOT NULL,
        entry_type  VARCHAR(50) NOT NULL,
        cleared     BOOLEAN DEFAULT false,
        cleared_at  TIMESTAMP,
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: wallet_ledger');

    // trip_events — audit log; includes updated_at per table convention
    await client.query(`
      CREATE TABLE IF NOT EXISTS trip_events (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id      UUID REFERENCES trips(id),
        event_type   VARCHAR(50) NOT NULL,
        performed_by UUID REFERENCES users(id),
        metadata     JSONB,
        created_at   TIMESTAMP DEFAULT NOW(),
        updated_at   TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: trip_events');

    // Drop FK trips.driver_id → users(id) so it can hold drivers.id UUIDs
    await client.query(`
      ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_driver_id_fkey
    `);
    console.log('✓ Dropped FK trips_driver_id_fkey (driver_id is now a free UUID)');

    // cancellation_requests — two-path cancellation flow
    await client.query(`
      CREATE TABLE IF NOT EXISTS cancellation_requests (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id               UUID NOT NULL REFERENCES trips(id),
        requested_by          UUID NOT NULL REFERENCES users(id),
        reason                TEXT NOT NULL,
        status                VARCHAR(20) NOT NULL DEFAULT 'pending',
        previous_trip_status  VARCHAR(50) NOT NULL,
        reviewed_by           UUID REFERENCES users(id),
        rejection_reason      TEXT,
        created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: cancellation_requests');

    // can_cancel_without_approval — Trip Admin pre-approval flag
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS can_cancel_without_approval BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('✓ Column added: users.can_cancel_without_approval');

    // trip_code — human-readable trip identifier (SYN-YYYY-000001)
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS trip_code_seq START 1
    `);
    console.log('✓ Sequence created: trip_code_seq');

    await client.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_code VARCHAR(30) UNIQUE
    `);
    console.log('✓ Column added: trips.trip_code');

    // Backfill trip_code for all existing trips (ordered by created_at ASC so older
    // trips get lower sequence numbers — gaps are acceptable if the migration reruns)
    await client.query(`
      DO $$
      DECLARE
        rec      RECORD;
        seq_val  BIGINT;
        yr       INT;
      BEGIN
        FOR rec IN
          SELECT id, created_at
          FROM   trips
          WHERE  trip_code IS NULL
          ORDER  BY created_at ASC
        LOOP
          seq_val := nextval('trip_code_seq');
          yr      := EXTRACT(YEAR FROM rec.created_at)::INT;
          UPDATE trips
          SET    trip_code = 'SYN-' || yr || '-' || LPAD(seq_val::TEXT, 6, '0')
          WHERE  id = rec.id;
        END LOOP;
      END;
      $$
    `);
    console.log('✓ Backfilled trips.trip_code for all existing trips');

    console.log('\n✅ Migration complete: 13 tables, trip_code column + sequence.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
