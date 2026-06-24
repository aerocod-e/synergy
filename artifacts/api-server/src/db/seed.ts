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

// ── 3. Demo pricing constants (kobo) ───────────────────────────────────────
const DEMO_LOADING_FEE   = 500_000;  // ₦5,000
const DEMO_UNLOADING_FEE = 300_000;  // ₦3,000

const DEMO_STAKEHOLDER_RATES = [
  { stakeholderName: 'Stakeholder Alpha', amount: 100_000 },  // ₦1,000
  { stakeholderName: 'Stakeholder Beta',  amount:  75_000 },  // ₦750
  { stakeholderName: 'Stakeholder Gamma', amount:  50_000 },  // ₦500
];

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    // ── Idempotent stale-role migration ───────────────────────────────────
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

    // ── Stakeholders ──────────────────────────────────────────────────────
    let stakeholdersUpserted = 0;
    const stakeholderIds: string[] = [];
    const stakeholderIdByName: Record<string, string> = {};

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
        stakeholderIdByName[sh.name] = id;
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
    const adminHash = await bcrypt.hash('Admin@1234', SALT_ROUNDS);
    const demoHash  = await bcrypt.hash('Demo@1234',  SALT_ROUNDS);

    // ── Super admin ───────────────────────────────────────────────────────
    const superAdminRes = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, entity_type, entity_id)
       VALUES ($1, $2, 'super_admin', NULL, NULL)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      ['superadmin@synergy.com', adminHash],
    );
    console.log(`✓ Super admin inserted: ${superAdminRes.rowCount ?? 0}`);

    // Fetch super admin id (may already exist)
    const superAdminRow = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE email = 'superadmin@synergy.com' AND deleted_at IS NULL LIMIT 1`,
    );
    const superAdminId = superAdminRow.rows[0].id;

    // ── Stakeholder admins ────────────────────────────────────────────────
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

    // ── Pricing chart ─────────────────────────────────────────────────────
    // Deactivate all currently active charts
    await client.query(`UPDATE pricing_charts SET is_active = false WHERE is_active = true`);

    // Find or create the demo pricing chart (matched by fees + creator)
    let pricingChartId: string;
    const existingChart = await client.query<{ id: string }>(
      `SELECT id FROM pricing_charts
       WHERE loading_fee = $1 AND unloading_fee = $2 AND created_by = $3
       LIMIT 1`,
      [DEMO_LOADING_FEE, DEMO_UNLOADING_FEE, superAdminId],
    );

    if (existingChart.rows.length > 0) {
      pricingChartId = existingChart.rows[0].id;
      await client.query(`UPDATE pricing_charts SET is_active = true WHERE id = $1`, [pricingChartId]);
      console.log(`✓ Pricing chart: reactivated existing`);
    } else {
      const newChart = await client.query<{ id: string }>(
        `INSERT INTO pricing_charts (loading_fee, unloading_fee, is_active, created_by)
         VALUES ($1, $2, true, $3)
         RETURNING id`,
        [DEMO_LOADING_FEE, DEMO_UNLOADING_FEE, superAdminId],
      );
      pricingChartId = newChart.rows[0].id;
      console.log(`✓ Pricing chart: created`);
    }

    // Upsert stakeholder rates for this chart
    for (const sr of DEMO_STAKEHOLDER_RATES) {
      const shId = stakeholderIdByName[sr.stakeholderName];
      if (!shId) continue;
      await client.query(
        `INSERT INTO pricing_chart_stakeholder_rates (pricing_chart_id, stakeholder_id, amount)
         VALUES ($1, $2, $3)
         ON CONFLICT (pricing_chart_id, stakeholder_id) DO UPDATE SET amount = EXCLUDED.amount`,
        [pricingChartId, shId, sr.amount],
      );
    }
    console.log(`✓ Pricing chart stakeholder rates upserted`);

    // ── Trip admin accounts ───────────────────────────────────────────────
    const TRIP_ADMINS_DEMO = [
      { email: 'lagos.ta1@synergy.com',  code: 'LG',  canCancel: true  },
      { email: 'lagos.ta2@synergy.com',  code: 'LG',  canCancel: false },
      { email: 'rivers.ta1@synergy.com', code: 'RI',  canCancel: false },
      { email: 'kano.ta1@synergy.com',   code: 'KN',  canCancel: false },
      { email: 'fct.ta1@synergy.com',    code: 'FCT', canCancel: false },
      { email: 'ogun.ta1@synergy.com',   code: 'OG',  canCancel: false },
    ];

    const taIdMap: Record<string, string> = {};
    let taUpserted = 0;

    for (const ta of TRIP_ADMINS_DEMO) {
      const stateId = stateIdMap[ta.code];
      if (!stateId) continue;
      const res = await client.query<{ id: string }>(
        `INSERT INTO users
           (email, password_hash, role, entity_type, entity_id, can_cancel_without_approval)
         VALUES ($1, $2, 'trip_admin', 'state', $3, $4)
         ON CONFLICT (email) DO UPDATE
           SET password_hash              = EXCLUDED.password_hash,
               is_active                  = true,
               deleted_at                 = NULL,
               can_cancel_without_approval = EXCLUDED.can_cancel_without_approval
         RETURNING id`,
        [ta.email, demoHash, stateId, ta.canCancel],
      );
      const id = res.rows[0]?.id;
      if (id) { taIdMap[ta.email] = id; taUpserted++; }
    }
    console.log(`✓ Trip admins upserted: ${taUpserted}`);

    // ── Vehicles ──────────────────────────────────────────────────────────
    const DEMO_VEHICLES = [
      { reg: 'LAG-001-AA', creator: 'lagos.ta1@synergy.com'  },
      { reg: 'LAG-002-BB', creator: 'lagos.ta1@synergy.com'  },
      { reg: 'LAG-003-CC', creator: 'lagos.ta1@synergy.com'  },
      { reg: 'LAG-004-DD', creator: 'lagos.ta2@synergy.com'  },
      { reg: 'LAG-005-EE', creator: 'lagos.ta2@synergy.com'  },
      { reg: 'KAN-001-AA', creator: 'kano.ta1@synergy.com'   },
      { reg: 'KAN-002-BB', creator: 'kano.ta1@synergy.com'   },
      { reg: 'RIV-001-AA', creator: 'rivers.ta1@synergy.com' },
    ];

    const vehicleIdMap: Record<string, string> = {};
    let vehUpserted = 0;

    for (const v of DEMO_VEHICLES) {
      const creatorId = taIdMap[v.creator];
      const res = await client.query<{ id: string }>(
        `INSERT INTO vehicles (registration_number, created_by)
         VALUES ($1, $2)
         ON CONFLICT (registration_number) DO UPDATE
           SET is_active = true, deleted_at = NULL
         RETURNING id`,
        [v.reg, creatorId],
      );
      const id = res.rows[0]?.id;
      if (id) { vehicleIdMap[v.reg] = id; vehUpserted++; }
    }
    console.log(`✓ Vehicles upserted: ${vehUpserted}`);

    // ── Drivers ───────────────────────────────────────────────────────────
    const DEMO_DRIVERS = [
      { name: 'Emeka Okafor',  lic: 'LG-2021-001', phone: '08012345671', creator: 'lagos.ta1@synergy.com'  },
      { name: 'Chidi Nwosu',   lic: 'LG-2021-002', phone: '08012345672', creator: 'lagos.ta1@synergy.com'  },
      { name: 'Bola Adeyemi',  lic: 'LG-2022-001', phone: '08012345673', creator: 'lagos.ta2@synergy.com'  },
      { name: 'Musa Ibrahim',  lic: 'KN-2021-001', phone: '08012345674', creator: 'kano.ta1@synergy.com'   },
      { name: 'Tunde Fashola', lic: 'RV-2021-001', phone: '08012345675', creator: 'rivers.ta1@synergy.com' },
    ];

    const driverIdMap: Record<string, string> = {};
    let drvUpserted = 0;

    for (const d of DEMO_DRIVERS) {
      const creatorId = taIdMap[d.creator];
      const res = await client.query<{ id: string }>(
        `INSERT INTO drivers (full_name, license_number, phone_number, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (license_number) DO UPDATE
           SET full_name = EXCLUDED.full_name, is_active = true, deleted_at = NULL
         RETURNING id`,
        [d.name, d.lic, d.phone, creatorId],
      );
      const id = res.rows[0]?.id;
      if (id) { driverIdMap[d.lic] = id; drvUpserted++; }
    }
    console.log(`✓ Drivers upserted: ${drvUpserted}`);

    // ── Demo Trips ────────────────────────────────────────────────────────
    // Load stakeholder rates for the active pricing chart
    type StakeholderRate = { stakeholderId: string; amount: number };
    const srRes = await client.query<{ stakeholder_id: string; amount: string }>(
      `SELECT stakeholder_id, amount
       FROM pricing_chart_stakeholder_rates
       WHERE pricing_chart_id = $1`,
      [pricingChartId],
    );
    const shRates: StakeholderRate[] = srRes.rows.map(r => ({
      stakeholderId: r.stakeholder_id,
      amount: Number(r.amount),
    }));

    // Helper: resolve wallet ID by owner
    const getWalletId = async (ownerType: string, ownerId: string): Promise<string> => {
      const r = await client.query<{ id: string }>(
        `SELECT id FROM wallets WHERE owner_type = $1 AND owner_id = $2`,
        [ownerType, ownerId],
      );
      return r.rows[0].id;
    };

    type TripSpec = {
      code: string;
      vehicleReg: string;
      driverLic: string;
      loadCode: string;
      unloadCode: string;
      originDesc: string;
      destDesc: string;
      status: string;
      creatorEmail: string;
      isCancelled?: boolean;
      isCancellationPending?: boolean;
    };

    const insertDemoTrip = async (spec: TripSpec): Promise<void> => {
      const vehicleId     = vehicleIdMap[spec.vehicleReg];
      const driverId      = driverIdMap[spec.driverLic];
      const loadStateId   = stateIdMap[spec.loadCode];
      const unloadStateId = stateIdMap[spec.unloadCode];
      const creatorId     = taIdMap[spec.creatorEmail];

      // Insert trip — idempotent via UNIQUE(trip_code)
      const tripRes = await client.query<{ id: string }>(
        `INSERT INTO trips
           (trip_code, vehicle_id, driver_id, loading_state_id, unloading_state_id,
            origin_description, destination_description, status, created_by
            ${spec.isCancelled ? ', deleted_at' : ''})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9
            ${spec.isCancelled ? ', NOW()' : ''})
         ON CONFLICT (trip_code) DO NOTHING
         RETURNING id`,
        [spec.code, vehicleId, driverId, loadStateId, unloadStateId,
         spec.originDesc, spec.destDesc, spec.status, creatorId],
      );

      const tripRow = tripRes.rows[0];
      if (!tripRow) {
        console.log(`  ↩ Trip ${spec.code}: already exists, skipped`);
        return;
      }
      const tripId = tripRow.id;

      // ── Trip fees ──────────────────────────────────────────────────────
      const loadFeeRes = await client.query<{ id: string }>(
        `INSERT INTO trip_fees (trip_id, recipient_type, recipient_id, fee_type, amount)
         VALUES ($1, 'state', $2, 'loading', $3) RETURNING id`,
        [tripId, loadStateId, DEMO_LOADING_FEE],
      );
      const loadFeeId = loadFeeRes.rows[0].id;

      const unloadFeeRes = await client.query<{ id: string }>(
        `INSERT INTO trip_fees (trip_id, recipient_type, recipient_id, fee_type, amount)
         VALUES ($1, 'state', $2, 'unloading', $3) RETURNING id`,
        [tripId, unloadStateId, DEMO_UNLOADING_FEE],
      );
      const unloadFeeId = unloadFeeRes.rows[0].id;

      const shFees: { feeId: string; shId: string; amount: number }[] = [];
      for (const sr of shRates) {
        const sfRes = await client.query<{ id: string }>(
          `INSERT INTO trip_fees (trip_id, recipient_type, recipient_id, fee_type, amount)
           VALUES ($1, 'stakeholder', $2, 'stakeholder_fee', $3) RETURNING id`,
          [tripId, sr.stakeholderId, sr.amount],
        );
        shFees.push({ feeId: sfRes.rows[0].id, shId: sr.stakeholderId, amount: sr.amount });
      }

      // ── Wallet credits ─────────────────────────────────────────────────
      const loadWalletId   = await getWalletId('state', loadStateId);
      const unloadWalletId = await getWalletId('state', unloadStateId);

      await client.query(
        `INSERT INTO wallet_ledger (wallet_id, trip_id, trip_fee_id, amount, entry_type)
         VALUES ($1, $2, $3, $4, 'credit')`,
        [loadWalletId, tripId, loadFeeId, DEMO_LOADING_FEE],
      );
      await client.query(
        `UPDATE wallets SET total_collected = total_collected + $1 WHERE id = $2`,
        [DEMO_LOADING_FEE, loadWalletId],
      );

      await client.query(
        `INSERT INTO wallet_ledger (wallet_id, trip_id, trip_fee_id, amount, entry_type)
         VALUES ($1, $2, $3, $4, 'credit')`,
        [unloadWalletId, tripId, unloadFeeId, DEMO_UNLOADING_FEE],
      );
      await client.query(
        `UPDATE wallets SET total_collected = total_collected + $1 WHERE id = $2`,
        [DEMO_UNLOADING_FEE, unloadWalletId],
      );

      for (const sf of shFees) {
        const shWalletId = await getWalletId('stakeholder', sf.shId);
        await client.query(
          `INSERT INTO wallet_ledger (wallet_id, trip_id, trip_fee_id, amount, entry_type)
           VALUES ($1, $2, $3, $4, 'credit')`,
          [shWalletId, tripId, sf.feeId, sf.amount],
        );
        await client.query(
          `UPDATE wallets SET total_collected = total_collected + $1 WHERE id = $2`,
          [sf.amount, shWalletId],
        );
      }

      // ── Wallet reversals (cancelled trips only) ────────────────────────
      if (spec.isCancelled) {
        await client.query(
          `INSERT INTO wallet_ledger (wallet_id, trip_id, trip_fee_id, amount, entry_type)
           VALUES ($1, $2, $3, $4, 'reversal')`,
          [loadWalletId, tripId, loadFeeId, -DEMO_LOADING_FEE],
        );
        await client.query(
          `UPDATE wallets SET total_collected = total_collected - $1 WHERE id = $2`,
          [DEMO_LOADING_FEE, loadWalletId],
        );

        await client.query(
          `INSERT INTO wallet_ledger (wallet_id, trip_id, trip_fee_id, amount, entry_type)
           VALUES ($1, $2, $3, $4, 'reversal')`,
          [unloadWalletId, tripId, unloadFeeId, -DEMO_UNLOADING_FEE],
        );
        await client.query(
          `UPDATE wallets SET total_collected = total_collected - $1 WHERE id = $2`,
          [DEMO_UNLOADING_FEE, unloadWalletId],
        );

        for (const sf of shFees) {
          const shWalletId = await getWalletId('stakeholder', sf.shId);
          await client.query(
            `INSERT INTO wallet_ledger (wallet_id, trip_id, trip_fee_id, amount, entry_type)
             VALUES ($1, $2, $3, $4, 'reversal')`,
            [shWalletId, tripId, sf.feeId, -sf.amount],
          );
          await client.query(
            `UPDATE wallets SET total_collected = total_collected - $1 WHERE id = $2`,
            [sf.amount, shWalletId],
          );
        }
      }

      // ── Trip events ────────────────────────────────────────────────────
      await client.query(
        `INSERT INTO trip_events (trip_id, event_type, performed_by) VALUES ($1, 'created', $2)`,
        [tripId, creatorId],
      );
      if (spec.status === 'in_transit' || spec.status === 'completed') {
        await client.query(
          `INSERT INTO trip_events (trip_id, event_type, performed_by) VALUES ($1, 'started', $2)`,
          [tripId, creatorId],
        );
      }
      if (spec.status === 'completed') {
        await client.query(
          `INSERT INTO trip_events (trip_id, event_type, performed_by) VALUES ($1, 'completed', $2)`,
          [tripId, creatorId],
        );
      }
      if (spec.isCancelled) {
        await client.query(
          `INSERT INTO trip_events (trip_id, event_type, performed_by) VALUES ($1, 'cancelled', $2)`,
          [tripId, creatorId],
        );
      }
      if (spec.isCancellationPending) {
        await client.query(
          `INSERT INTO trip_events (trip_id, event_type, performed_by) VALUES ($1, 'cancellation_requested', $2)`,
          [tripId, creatorId],
        );
        await client.query(
          `INSERT INTO cancellation_requests
             (trip_id, requested_by, reason, status, previous_trip_status)
           VALUES ($1, $2, $3, 'pending', 'in_transit')`,
          [tripId, creatorId, 'Cargo owner requested cancellation due to route change.'],
        );
      }

      console.log(`  ✓ Trip ${spec.code} (${spec.status})`);
    };

    const DEMO_TRIPS: TripSpec[] = [
      // Trip 1 – Lagos→Kano, completed
      {
        code: 'DEMO-2026-000001', vehicleReg: 'LAG-001-AA', driverLic: 'LG-2021-001',
        loadCode: 'LG', unloadCode: 'KN',
        originDesc: 'Lagos (Apapa Port)', destDesc: 'Kano (Bello Road Terminal)',
        status: 'completed', creatorEmail: 'lagos.ta1@synergy.com',
      },
      // Trip 2 – Lagos→Rivers, completed
      {
        code: 'DEMO-2026-000002', vehicleReg: 'LAG-002-BB', driverLic: 'LG-2021-002',
        loadCode: 'LG', unloadCode: 'RI',
        originDesc: 'Lagos (Tin Can Island Port)', destDesc: 'Rivers (Trans-Amadi Industrial)',
        status: 'completed', creatorEmail: 'lagos.ta1@synergy.com',
      },
      // Trip 3 – Lagos→FCT, completed
      {
        code: 'DEMO-2026-000003', vehicleReg: 'LAG-003-CC', driverLic: 'LG-2021-001',
        loadCode: 'LG', unloadCode: 'FCT',
        originDesc: 'Lagos (Ikorodu Logistics Hub)', destDesc: 'Abuja (Gwagwalada Depot)',
        status: 'completed', creatorEmail: 'lagos.ta1@synergy.com',
      },
      // Trip 4 – Lagos→Kano, in_transit
      {
        code: 'DEMO-2026-000004', vehicleReg: 'LAG-004-DD', driverLic: 'LG-2022-001',
        loadCode: 'LG', unloadCode: 'KN',
        originDesc: 'Lagos (Ikeja Industrial Area)', destDesc: 'Kano (Badawa Market)',
        status: 'in_transit', creatorEmail: 'lagos.ta2@synergy.com',
      },
      // Trip 5 – Lagos→Rivers, in_transit
      {
        code: 'DEMO-2026-000005', vehicleReg: 'LAG-005-EE', driverLic: 'LG-2022-001',
        loadCode: 'LG', unloadCode: 'RI',
        originDesc: 'Lagos (Apapa Port)', destDesc: 'Rivers (Mile 1 Market)',
        status: 'in_transit', creatorEmail: 'lagos.ta2@synergy.com',
      },
      // Trip 6 – Kano→Lagos, created
      {
        code: 'DEMO-2026-000006', vehicleReg: 'KAN-001-AA', driverLic: 'KN-2021-001',
        loadCode: 'KN', unloadCode: 'LG',
        originDesc: 'Kano (Kurmi Market)', destDesc: 'Lagos (Oshodi Terminal)',
        status: 'created', creatorEmail: 'kano.ta1@synergy.com',
      },
      // Trip 7 – Kano→FCT, created
      {
        code: 'DEMO-2026-000007', vehicleReg: 'KAN-002-BB', driverLic: 'KN-2021-001',
        loadCode: 'KN', unloadCode: 'FCT',
        originDesc: 'Kano (Sabon Gari)', destDesc: 'Abuja (Area 1 Depot)',
        status: 'created', creatorEmail: 'kano.ta1@synergy.com',
      },
      // Trip 8 – Lagos→Ogun, cancelled (with reversals)
      {
        code: 'DEMO-2026-000008', vehicleReg: 'LAG-001-AA', driverLic: 'LG-2021-001',
        loadCode: 'LG', unloadCode: 'OG',
        originDesc: 'Lagos (Apapa Port)', destDesc: 'Ogun (Sagamu Interchange)',
        status: 'cancelled', creatorEmail: 'lagos.ta1@synergy.com',
        isCancelled: true,
      },
      // Trip 9 – Lagos→Rivers, cancellation_pending
      {
        code: 'DEMO-2026-000009', vehicleReg: 'LAG-004-DD', driverLic: 'LG-2022-001',
        loadCode: 'LG', unloadCode: 'RI',
        originDesc: 'Lagos (Ikeja Industrial Area)', destDesc: 'Rivers (Trans-Amadi Industrial)',
        status: 'cancellation_pending', creatorEmail: 'lagos.ta2@synergy.com',
        isCancellationPending: true,
      },
    ];

    console.log('\n── Demo trips ──');
    for (const spec of DEMO_TRIPS) {
      await insertDemoTrip(spec);
    }
    console.log(`✓ Demo trips processed: ${DEMO_TRIPS.length}`);

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
