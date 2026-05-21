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

    console.log('\n✅ All 8 tables created successfully.');
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
