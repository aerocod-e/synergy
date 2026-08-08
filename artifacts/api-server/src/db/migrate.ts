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

    // vehicle_types — fee schedule keyed by vehicle category; amounts in kobo
    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicle_types (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name          VARCHAR(100) NOT NULL UNIQUE,
        loading_fee   INTEGER NOT NULL DEFAULT 0,
        unloading_fee INTEGER NOT NULL DEFAULT 0,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: vehicle_types');

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

    // hide_trips_tab — super_admin-only preference to hide the Trips tab on their own account
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS hide_trips_tab BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('✓ users: hide_trips_tab column added');

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

    // pricing_chart_stakeholder_rates — per-stakeholder per-vehicle-type rates
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

    // Add vehicle_type_id column to pricing_chart_stakeholder_rates
    await client.query(`
      ALTER TABLE pricing_chart_stakeholder_rates
        ADD COLUMN IF NOT EXISTS vehicle_type_id UUID REFERENCES vehicle_types(id)
    `);
    console.log('✓ pricing_chart_stakeholder_rates: vehicle_type_id column added');

    // Drop old unique constraint (pricing_chart_id, stakeholder_id) and replace with
    // a three-column constraint that includes vehicle_type_id.
    // NOTE: PostgreSQL truncates auto-generated constraint names to 63 chars — use
    // the actual truncated name, not the full logical one.
    await client.query(`
      ALTER TABLE pricing_chart_stakeholder_rates
        DROP CONSTRAINT IF EXISTS pricing_chart_stakeholder_rat_pricing_chart_id_stakeholder__key
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'pricing_chart_stakeholder_rates_unique'
        ) THEN
          ALTER TABLE pricing_chart_stakeholder_rates
            ADD CONSTRAINT pricing_chart_stakeholder_rates_unique
            UNIQUE (pricing_chart_id, stakeholder_id, vehicle_type_id);
        END IF;
      END;
      $$
    `);
    console.log('✓ pricing_chart_stakeholder_rates: unique constraint updated to (chart, stakeholder, vehicle_type)');

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

    // Add vehicle_type_id FK to vehicles
    await client.query(`
      ALTER TABLE vehicles
        ADD COLUMN IF NOT EXISTS vehicle_type_id UUID REFERENCES vehicle_types(id)
    `);
    console.log('✓ vehicles: vehicle_type_id column added');

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

    // vehicles ← trips: add vehicle_id FK (populated at INSERT time on fresh installs)
    await client.query(`
      ALTER TABLE trips
        ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id)
    `);

    // Enforce the NOT NULL constraint (idempotent).
    await client.query(`
      ALTER TABLE trips ALTER COLUMN vehicle_id SET NOT NULL
    `);

    // Drop the legacy column if it somehow still exists (IF EXISTS makes this idempotent).
    await client.query(`
      ALTER TABLE trips DROP COLUMN IF EXISTS vehicle_number
    `);

    console.log('✓ vehicle_id FK enforced NOT NULL, legacy vehicle_number dropped (if present)');

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

    // ── first_name / last_name on users ──────────────────────────────────
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS last_name  VARCHAR(100) NOT NULL DEFAULT ''
    `);
    console.log('✓ users: first_name, last_name columns added (if not exists)');

    // ── Drop deprecated per-state loading / unloading rate columns ────────
    // Fees are now driven by vehicle_types.loading_fee / unloading_fee
    await client.query(`
      ALTER TABLE states DROP COLUMN IF EXISTS loading_rate
    `);
    await client.query(`
      ALTER TABLE states DROP COLUMN IF EXISTS unloading_rate
    `);
    console.log('✓ states: deprecated loading_rate and unloading_rate columns dropped');

    // Make legacy pricing_chart fee columns optional (deprecated in favour of vehicle-type rates)
    await client.query(`
      ALTER TABLE pricing_charts
        ALTER COLUMN loading_fee  SET DEFAULT 0,
        ALTER COLUMN unloading_fee SET DEFAULT 0
    `);
    console.log('✓ pricing_charts: loading_fee / unloading_fee set DEFAULT 0 (deprecated)');

    // wallets.is_clearing_enabled — Super Admin opt-in flag for EOD clearing
    await client.query(`
      ALTER TABLE wallets ADD COLUMN IF NOT EXISTS is_clearing_enabled BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('✓ wallets: is_clearing_enabled column added (default false)');

    // Trigger: enforce referential integrity on wallets.owner_id (polymorphic FK simulation)
    // wallets.owner_id has no native FK because it references either states or stakeholders
    // depending on owner_type. This trigger rejects any INSERT/UPDATE with a dangling owner_id.
    await client.query(`
      CREATE OR REPLACE FUNCTION check_wallet_owner_exists() RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.owner_type = 'state' THEN
          IF NOT EXISTS (SELECT 1 FROM states WHERE id = NEW.owner_id) THEN
            RAISE EXCEPTION 'wallets.owner_id % does not exist in states', NEW.owner_id;
          END IF;
        ELSIF NEW.owner_type = 'stakeholder' THEN
          IF NOT EXISTS (SELECT 1 FROM stakeholders WHERE id = NEW.owner_id) THEN
            RAISE EXCEPTION 'wallets.owner_id % does not exist in stakeholders', NEW.owner_id;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS wallet_owner_check ON wallets;
      CREATE TRIGGER wallet_owner_check
      BEFORE INSERT OR UPDATE ON wallets
      FOR EACH ROW EXECUTE FUNCTION check_wallet_owner_exists();
    `);
    console.log('✓ Trigger created: wallet_owner_check (prevents orphaned wallet owner_id)');

    // Trigger: prevent hard-deleting a stakeholder while a wallet still references it.
    // Soft-delete (is_active = false) remains the correct removal path.
    await client.query(`
      CREATE OR REPLACE FUNCTION prevent_stakeholder_delete_with_wallet() RETURNS TRIGGER AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM wallets WHERE owner_type = 'stakeholder' AND owner_id = OLD.id) THEN
          RAISE EXCEPTION 'Cannot delete stakeholder % because a wallet still references it, deactivate instead', OLD.id;
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS stakeholder_delete_guard ON stakeholders;
      CREATE TRIGGER stakeholder_delete_guard
      BEFORE DELETE ON stakeholders
      FOR EACH ROW EXECUTE FUNCTION prevent_stakeholder_delete_with_wallet();
    `);
    console.log('✓ Trigger created: stakeholder_delete_guard (prevents hard-delete of stakeholder with wallet)');

    // drivers.license_expiry_date — required going forward for new drivers, nullable for legacy rows
    await client.query(`
      ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_expiry_date DATE
    `);
    console.log('✓ drivers: license_expiry_date column added');

    // driver_license_history — audit trail of license number/expiry changes
    await client.query(`
      CREATE TABLE IF NOT EXISTS driver_license_history (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_id           UUID NOT NULL REFERENCES drivers(id),
        old_license_number  VARCHAR(100),
        new_license_number  VARCHAR(100) NOT NULL,
        old_expiry_date     DATE,
        new_expiry_date     DATE NOT NULL,
        changed_by          UUID REFERENCES users(id),
        changed_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✓ Table created: driver_license_history');

    // bulk_payments — lump-sum company payments split across states/stakeholders
    await client.query(`
      CREATE TABLE IF NOT EXISTS bulk_payments (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name       VARCHAR NOT NULL,
        total_amount       INTEGER NOT NULL,
        expiry_date        DATE NOT NULL,
        created_by         UUID REFERENCES users(id),
        status             VARCHAR NOT NULL DEFAULT 'active',
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reversal_deadline  TIMESTAMPTZ NOT NULL
      )
    `);
    console.log('✓ Table created: bulk_payments');

    // archived — pure "remove from list" flag; never touches wallets/ledger
    await client.query(`
      ALTER TABLE bulk_payments ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('✓ bulk_payments: archived column added');

    // bulk_payment_shares — per-recipient percentage split of a bulk payment
    await client.query(`
      CREATE TABLE IF NOT EXISTS bulk_payment_shares (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bulk_payment_id   UUID REFERENCES bulk_payments(id),
        recipient_type    VARCHAR NOT NULL,
        recipient_id      UUID NOT NULL,
        percentage        NUMERIC(5,2) NOT NULL,
        amount            INTEGER NOT NULL
      )
    `);
    console.log('✓ Table created: bulk_payment_shares');

    // wallet_ledger.bulk_payment_id — traces a ledger entry back to a bulk payment
    // instead of a trip, so bulk-payment credits/reversals reuse the same ledger shape.
    await client.query(`
      ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS bulk_payment_id UUID REFERENCES bulk_payments(id)
    `);
    console.log('✓ wallet_ledger: bulk_payment_id column added');

    console.log('\n✅ Migration complete: 15 tables + vehicle_type_id columns + vehicle-type-based pricing + clearing flag + wallet integrity triggers + driver license history + bulk payments.');
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
