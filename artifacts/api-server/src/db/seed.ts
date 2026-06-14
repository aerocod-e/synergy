import bcrypt from 'bcrypt';
import pool from './connection';

const SALT_ROUNDS = 12;

// ── 1. States ──────────────────────────────────────────────────────────────
const STATES = [
  { name: 'Abia',        code: 'AB'  },
  { name: 'Adamawa',     code: 'AD'  },
  { name: 'Akwa Ibom',   code: 'AK'  },
  { name: 'Anambra',     code: 'AN'  },
  { name: 'Bauchi',      code: 'BA'  },
  { name: 'Bayelsa',     code: 'BY'  },
  { name: 'Benue',       code: 'BE'  },
  { name: 'Borno',       code: 'BO'  },
  { name: 'Cross River', code: 'CR'  },
  { name: 'Delta',       code: 'DE'  },
  { name: 'Ebonyi',      code: 'EB'  },
  { name: 'Edo',         code: 'ED'  },
  { name: 'Ekiti',       code: 'EK'  },
  { name: 'Enugu',       code: 'EN'  },
  { name: 'Gombe',       code: 'GO'  },
  { name: 'Imo',         code: 'IM'  },
  { name: 'Jigawa',      code: 'JI'  },
  { name: 'Kaduna',      code: 'KD'  },
  { name: 'Kano',        code: 'KN'  },
  { name: 'Katsina',     code: 'KT'  },
  { name: 'Kebbi',       code: 'KB'  },
  { name: 'Kogi',        code: 'KO'  },
  { name: 'Kwara',       code: 'KW'  },
  { name: 'Lagos',       code: 'LG'  },
  { name: 'Nasarawa',    code: 'NA'  },
  { name: 'Niger',       code: 'NI'  },
  { name: 'Ogun',        code: 'OG'  },
  { name: 'Ondo',        code: 'ON'  },
  { name: 'Osun',        code: 'OS'  },
  { name: 'Oyo',         code: 'OY'  },
  { name: 'Plateau',     code: 'PL'  },
  { name: 'Rivers',      code: 'RI'  },
  { name: 'Sokoto',      code: 'SO'  },
  { name: 'Taraba',      code: 'TA'  },
  { name: 'Yobe',        code: 'YO'  },
  { name: 'Zamfara',     code: 'ZA'  },
  { name: 'FCT Abuja',   code: 'FCT' },
];

// ── 2. Stakeholders ────────────────────────────────────────────────────────
const STAKEHOLDERS = [
  { name: 'Stakeholder Alpha', description: 'Placeholder stakeholder 1' },
  { name: 'Stakeholder Beta',  description: 'Placeholder stakeholder 2' },
  { name: 'Stakeholder Gamma', description: 'Placeholder stakeholder 3' },
];

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    // ── Idempotent stale-role migration ───────────────────────────────────
    // Fixes any existing rows that pre-date the 4-role schema.
    // Safe to run on a fresh DB (UPDATE 0 rows) or a partially-migrated one.
    await client.query(`
      UPDATE users SET role = 'state_admin'
      WHERE role = 'admin' AND entity_type = 'state'
    `);
    await client.query(`
      UPDATE users SET role = 'stakeholder'
      WHERE role = 'admin' AND entity_type = 'stakeholder'
    `);
    await client.query(`
      UPDATE users
      SET deleted_at = NOW(), is_active = false
      WHERE role = 'driver' AND deleted_at IS NULL
    `);
    const staleCheck = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM users
       WHERE role IN ('admin', 'driver') AND deleted_at IS NULL`,
    );
    const staleCount = parseInt(staleCheck.rows[0]?.count ?? '0', 10);
    if (staleCount > 0) {
      throw new Error(`Stale role migration incomplete: ${staleCount} rows still have legacy roles`);
    }
    console.log('✓ Stale role migration: 0 legacy-role rows remain');

    // ── States ────────────────────────────────────────────────────────────
    let statesUpserted = 0;
    const stateIdMap: Record<string, string> = {};

    for (const s of STATES) {
      const res = await client.query<{ id: string }>(
        `INSERT INTO states (name, code)
         VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [s.name, s.code],
      );
      const id = res.rows[0]?.id;
      if (id) {
        stateIdMap[s.code] = id;
        statesUpserted++;
      }
    }
    console.log(`✓ States upserted: ${statesUpserted}`);

    // ── Stakeholders — conflict on name (UNIQUE constraint) ───────────────
    let stakeholdersUpserted = 0;
    const stakeholderIds: string[] = [];

    for (const sh of STAKEHOLDERS) {
      const res = await client.query<{ id: string }>(
        `INSERT INTO stakeholders (name, description)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
         RETURNING id`,
        [sh.name, sh.description],
      );
      const id = res.rows[0]?.id;
      if (id) {
        stakeholderIds.push(id);
        stakeholdersUpserted++;
      }
    }
    console.log(`✓ Stakeholders upserted: ${stakeholdersUpserted}`);

    // ── Wallets (one per state + one per stakeholder) ─────────────────────
    let walletsInserted = 0;

    for (const stateId of Object.values(stateIdMap)) {
      const res = await client.query(
        `INSERT INTO wallets (owner_type, owner_id, total_collected)
         VALUES ('state', $1, 0)
         ON CONFLICT (owner_type, owner_id) DO NOTHING`,
        [stateId],
      );
      walletsInserted += res.rowCount ?? 0;
    }

    for (const shId of stakeholderIds) {
      const res = await client.query(
        `INSERT INTO wallets (owner_type, owner_id, total_collected)
         VALUES ('stakeholder', $1, 0)
         ON CONFLICT (owner_type, owner_id) DO NOTHING`,
        [shId],
      );
      walletsInserted += res.rowCount ?? 0;
    }
    console.log(`✓ Wallets inserted: ${walletsInserted}`);

    // ── Hash passwords ────────────────────────────────────────────────────
    const adminHash  = await bcrypt.hash('Admin@1234',  SALT_ROUNDS);

    // ── Super admin ───────────────────────────────────────────────────────
    const superAdminRes = await client.query(
      `INSERT INTO users (email, password_hash, role, entity_type, entity_id)
       VALUES ($1, $2, 'super_admin', NULL, NULL)
       ON CONFLICT (email) DO NOTHING`,
      ['superadmin@synergy.com', adminHash],
    );
    console.log(`✓ Super admin inserted: ${superAdminRes.rowCount ?? 0}`);

    // ── Stakeholder admins (one per stakeholder) ──────────────────────────
    const stakeholderAdmins = [
      { email: 'alpha.admin@synergy.com', idx: 0 },
      { email: 'beta.admin@synergy.com',  idx: 1 },
      { email: 'gamma.admin@synergy.com', idx: 2 },
    ];

    let shAdminsInserted = 0;
    for (const sa of stakeholderAdmins) {
      const shId = stakeholderIds[sa.idx];
      if (!shId) continue;
      const res = await client.query(
        `INSERT INTO users (email, password_hash, role, entity_type, entity_id)
         VALUES ($1, $2, 'stakeholder', 'stakeholder', $3)
         ON CONFLICT (email) DO NOTHING`,
        [sa.email, adminHash, shId],
      );
      shAdminsInserted += res.rowCount ?? 0;
    }
    console.log(`✓ Stakeholder admins inserted: ${shAdminsInserted}`);

    // ── State admins (5 demo states) ──────────────────────────────────────
    const stateAdmins = [
      { email: 'lagos.admin@synergy.com',  code: 'LG'  },
      { email: 'kano.admin@synergy.com',   code: 'KN'  },
      { email: 'rivers.admin@synergy.com', code: 'RI'  },
      { email: 'fct.admin@synergy.com',    code: 'FCT' },
      { email: 'ogun.admin@synergy.com',   code: 'OG'  },
    ];

    let stateAdminsInserted = 0;
    for (const sa of stateAdmins) {
      const stateId = stateIdMap[sa.code];
      if (!stateId) continue;
      const res = await client.query(
        `INSERT INTO users (email, password_hash, role, entity_type, entity_id)
         VALUES ($1, $2, 'state_admin', 'state', $3)
         ON CONFLICT (email) DO NOTHING`,
        [sa.email, adminHash, stateId],
      );
      stateAdminsInserted += res.rowCount ?? 0;
    }
    console.log(`✓ State admins inserted: ${stateAdminsInserted}`);

    console.log('\n✅ Seed complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
