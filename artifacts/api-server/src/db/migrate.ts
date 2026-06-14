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
        vehicle_number          VARCHAR(50) NOT NULL,
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

    // Backfill: insert one vehicle per distinct plate seen in ANY trip (including
    // soft-deleted), then link ALL trips — so vehicle_id is never null.
    await client.query(`
      INSERT INTO vehicles (registration_number, created_by, is_active)
      SELECT DISTINCT ON (vehicle_number)
        vehicle_number,
        created_by,
        true
      FROM trips
      ON CONFLICT (registration_number) DO NOTHING
    `);

    await client.query(`
      UPDATE trips t
      SET    vehicle_id = v.id
      FROM   vehicles v
      WHERE  v.registration_number = t.vehicle_number
        AND  t.vehicle_id IS NULL
    `);

    // Enforce the constraint now that every row is covered.
    await client.query(`
      ALTER TABLE trips ALTER COLUMN vehicle_id SET NOT NULL
    `);

    console.log('✓ Backfilled vehicle_id on trips (all rows) and enforced NOT NULL');

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

    console.log('\n✅ All 12 tables created successfully.');
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
