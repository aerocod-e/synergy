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
  { name: 'Consultant', description: 'Consultant stakeholder' },
  { name: 'Vendor',     description: 'Vendor stakeholder'     },
  { name: 'Integrator', description: 'Integrator stakeholder' },
];

// ── 3. Vehicle types (amounts in kobo) ────────────────────────────────────
const VEHICLE_TYPES = [
  { name: 'Buses and Equivalent',                    loading_fee:  52_500, unloading_fee:  52_500 },
  { name: 'Pickup Vans and Equivalent (4 Tyres)',    loading_fee: 140_000, unloading_fee: 140_000 },
  { name: 'Pickup Non-Heavy Duty 6/8 Tyres',        loading_fee: 192_500, unloading_fee: 192_500 },
  { name: 'Heavy Duty 6/8 Tyres',                   loading_fee: 280_000, unloading_fee: 280_000 },
  { name: 'Luxury Buses and Equivalent',             loading_fee: 350_000, unloading_fee: 350_000 },
  { name: '12/14 Tyres and Equivalent',              loading_fee: 665_000, unloading_fee: 665_000 },
  { name: '18 Tyres and above',                      loading_fee: 875_000, unloading_fee: 875_000 },
];

// ── 4. Stakeholder rates per vehicle type (amounts in kobo) ───────────────
// Keys are vehicle type names; values are { Consultant, Vendor, Integrator } amounts
const STAKEHOLDER_RATES_BY_VEHICLE_TYPE: Record<string, Record<string, number>> = {
  'Buses and Equivalent':                  { Consultant:  15_000, Vendor:  15_000, Integrator:  15_000 },
  'Pickup Vans and Equivalent (4 Tyres)':  { Consultant:       0, Vendor:  50_000, Integrator:  70_000 },
  'Pickup Non-Heavy Duty 6/8 Tyres':       { Consultant:  15_000, Vendor:  50_000, Integrator: 100_000 },
  'Heavy Duty 6/8 Tyres':                  { Consultant:  40_000, Vendor:  50_000, Integrator: 150_000 },
  'Luxury Buses and Equivalent':           { Consultant:  50_000, Vendor:  50_000, Integrator: 200_000 },
  '12/14 Tyres and Equivalent':            { Consultant: 220_000, Vendor: 150_000, Integrator: 200_000 },
  '18 Tyres and above':                    { Consultant: 350_000, Vendor: 200_000, Integrator: 200_000 },
};

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

    // ── Rename legacy stakeholder names ───────────────────────────────────
    await client.query(`UPDATE stakeholders SET name = 'Consultant' WHERE name = 'Stakeholder Alpha'`);
    await client.query(`UPDATE stakeholders SET name = 'Vendor'     WHERE name = 'Stakeholder Beta'`);
    await client.query(`UPDATE stakeholders SET name = 'Integrator' WHERE name = 'Stakeholder Gamma'`);
    await client.query(`
      UPDATE users SET first_name = 'Consultant', last_name = 'Account'
      WHERE email = 'alpha.admin@synergy.com'
    `);
    await client.query(`
      UPDATE users SET first_name = 'Vendor', last_name = 'Account'
      WHERE email = 'beta.admin@synergy.com'
    `);
    await client.query(`
      UPDATE users SET first_name = 'Integrator', last_name = 'Account'
      WHERE email = 'gamma.admin@synergy.com'
    `);
    console.log('✓ Stakeholder names updated: Alpha→Consultant, Beta→Vendor, Gamma→Integrator');

    // ── Deactivate test/development stakeholders ──────────────────────────
    await client.query(`
      UPDATE stakeholders SET is_active = false
      WHERE name IN ('Merge Test Union', 'New Transport Union', 'Test Union', 'Test Org Reactivate')
    `);
    console.log('✓ Test stakeholders deactivated');

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

    // ── Vehicle types ─────────────────────────────────────────────────────
    const vehicleTypeIdByName: Record<string, string> = {};

    for (const vt of VEHICLE_TYPES) {
      const res = await client.query<{ id: string }>(
        `INSERT INTO vehicle_types (name, loading_fee, unloading_fee)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE
           SET loading_fee   = EXCLUDED.loading_fee,
               unloading_fee = EXCLUDED.unloading_fee
         RETURNING id`,
        [vt.name, vt.loading_fee, vt.unloading_fee],
      );
      const id = res.rows[0]?.id;
      if (id) vehicleTypeIdByName[vt.name] = id;
    }
    console.log(`✓ Vehicle types upserted: ${Object.keys(vehicleTypeIdByName).length}`);

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
      `INSERT INTO users (email, password_hash, role, entity_type, entity_id, first_name, last_name)
       VALUES ($1, $2, 'super_admin', NULL, NULL, 'Super', 'Admin')
       ON CONFLICT (email) DO UPDATE
         SET first_name = 'Super', last_name = 'Admin'
       RETURNING id`,
      ['superadmin@synergy.com', adminHash],
    );
    console.log(`✓ Super admin inserted: ${superAdminRes.rowCount ?? 0}`);

    const superAdminRow = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE email = 'superadmin@synergy.com' AND deleted_at IS NULL LIMIT 1`,
    );
    const superAdminId = superAdminRow.rows[0].id;

    // ── Stakeholder admins ────────────────────────────────────────────────
    const stakeholderAdmins = [
      { email: 'alpha.admin@synergy.com', idx: 0, firstName: 'Consultant', lastName: 'Account' },
      { email: 'beta.admin@synergy.com',  idx: 1, firstName: 'Vendor',     lastName: 'Account' },
      { email: 'gamma.admin@synergy.com', idx: 2, firstName: 'Integrator', lastName: 'Account' },
    ];

    let shAdminsInserted = 0;
    for (const sa of stakeholderAdmins) {
      const shId = stakeholderIds[sa.idx];
      if (!shId) continue;
      const res = await client.query(
        `INSERT INTO users (email, password_hash, role, entity_type, entity_id, first_name, last_name)
         VALUES ($1, $2, 'stakeholder', 'stakeholder', $3, $4, $5)
         ON CONFLICT (email) DO UPDATE
           SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name`,
        [sa.email, adminHash, shId, sa.firstName, sa.lastName],
      );
      shAdminsInserted += res.rowCount ?? 0;
    }
    console.log(`✓ Stakeholder admins inserted: ${shAdminsInserted}`);

    // ── State admins (5 demo states) ──────────────────────────────────────
    const stateAdmins = [
      { email: 'lagos.admin@synergy.com',  code: 'LG',  firstName: 'Lagos',  lastName: 'State Admin' },
      { email: 'kano.admin@synergy.com',   code: 'KN',  firstName: 'Kano',   lastName: 'State Admin' },
      { email: 'rivers.admin@synergy.com', code: 'RI',  firstName: 'Rivers', lastName: 'State Admin' },
      { email: 'fct.admin@synergy.com',    code: 'FCT', firstName: 'FCT',    lastName: 'State Admin' },
      { email: 'ogun.admin@synergy.com',   code: 'OG',  firstName: 'Ogun',   lastName: 'State Admin' },
    ];

    let stateAdminsInserted = 0;
    for (const sa of stateAdmins) {
      const stateId = stateIdMap[sa.code];
      if (!stateId) continue;
      const res = await client.query(
        `INSERT INTO users (email, password_hash, role, entity_type, entity_id, first_name, last_name)
         VALUES ($1, $2, 'state_admin', 'state', $3, $4, $5)
         ON CONFLICT (email) DO UPDATE
           SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name`,
        [sa.email, adminHash, stateId, sa.firstName, sa.lastName],
      );
      stateAdminsInserted += res.rowCount ?? 0;
    }
    console.log(`✓ State admins inserted: ${stateAdminsInserted}`);

    // ── Pricing chart ─────────────────────────────────────────────────────
    // Deactivate all currently active charts
    await client.query(`UPDATE pricing_charts SET is_active = false WHERE is_active = true`);

    // Find or create the demo pricing chart (matched by creator; loading/unloading fees are deprecated)
    let pricingChartId: string;
    const existingChart = await client.query<{ id: string }>(
      `SELECT id FROM pricing_charts WHERE created_by = $1 ORDER BY created_at ASC LIMIT 1`,
      [superAdminId],
    );

    if (existingChart.rows.length > 0) {
      pricingChartId = existingChart.rows[0].id;
      await client.query(`UPDATE pricing_charts SET is_active = true WHERE id = $1`, [pricingChartId]);
      console.log(`✓ Pricing chart: reactivated existing`);
    } else {
      const newChart = await client.query<{ id: string }>(
        `INSERT INTO pricing_charts (loading_fee, unloading_fee, is_active, created_by)
         VALUES (0, 0, true, $1)
         RETURNING id`,
        [superAdminId],
      );
      pricingChartId = newChart.rows[0].id;
      console.log(`✓ Pricing chart: created`);
    }

    // ── Stakeholder rates per vehicle type ────────────────────────────────
    // Delete existing rates for this chart so we can re-seed cleanly
    await client.query(
      `DELETE FROM pricing_chart_stakeholder_rates WHERE pricing_chart_id = $1`,
      [pricingChartId],
    );

    let ratesInserted = 0;
    for (const [vtName, rates] of Object.entries(STAKEHOLDER_RATES_BY_VEHICLE_TYPE)) {
      const vtId = vehicleTypeIdByName[vtName];
      if (!vtId) continue;
      for (const [stakeholderName, amount] of Object.entries(rates)) {
        const shId = stakeholderIdByName[stakeholderName];
        if (!shId) continue;
        await client.query(
          `INSERT INTO pricing_chart_stakeholder_rates
             (pricing_chart_id, stakeholder_id, vehicle_type_id, amount)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ON CONSTRAINT pricing_chart_stakeholder_rates_unique
           DO UPDATE SET amount = EXCLUDED.amount`,
          [pricingChartId, shId, vtId, amount],
        );
        ratesInserted++;
      }
    }
    console.log(`✓ Pricing chart stakeholder rates upserted: ${ratesInserted} rows (${VEHICLE_TYPES.length} types × ${STAKEHOLDERS.length} stakeholders)`);

    // ── Trip admin accounts ───────────────────────────────────────────────
    const TRIP_ADMINS_DEMO = [
      { email: 'lagos.ta1@synergy.com',  code: 'LG',  canCancel: true,  firstName: 'Lagos',  lastName: 'Trip Admin 1' },
      { email: 'lagos.ta2@synergy.com',  code: 'LG',  canCancel: false, firstName: 'Lagos',  lastName: 'Trip Admin 2' },
      { email: 'rivers.ta1@synergy.com', code: 'RI',  canCancel: false, firstName: 'Rivers', lastName: 'Trip Admin 1' },
      { email: 'kano.ta1@synergy.com',   code: 'KN',  canCancel: false, firstName: 'Kano',   lastName: 'Trip Admin 1' },
      { email: 'fct.ta1@synergy.com',    code: 'FCT', canCancel: false, firstName: 'FCT',    lastName: 'Trip Admin 1' },
      { email: 'ogun.ta1@synergy.com',   code: 'OG',  canCancel: false, firstName: 'Ogun',   lastName: 'Trip Admin 1' },
    ];

    const taIdMap: Record<string, string> = {};
    let taUpserted = 0;

    for (const ta of TRIP_ADMINS_DEMO) {
      const stateId = stateIdMap[ta.code];
      if (!stateId) continue;
      const res = await client.query<{ id: string }>(
        `INSERT INTO users
           (email, password_hash, role, entity_type, entity_id, can_cancel_without_approval, first_name, last_name)
         VALUES ($1, $2, 'trip_admin', 'state', $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE
           SET password_hash               = EXCLUDED.password_hash,
               is_active                   = true,
               deleted_at                  = NULL,
               can_cancel_without_approval = EXCLUDED.can_cancel_without_approval,
               first_name                  = EXCLUDED.first_name,
               last_name                   = EXCLUDED.last_name
         RETURNING id`,
        [ta.email, demoHash, stateId, ta.canCancel, ta.firstName, ta.lastName],
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

    // ── Assign vehicle types to demo vehicles (Heavy Duty as default) ─────
    const heavyDutyTypeId = vehicleTypeIdByName['Heavy Duty 6/8 Tyres'];
    if (heavyDutyTypeId) {
      await client.query(
        `UPDATE vehicles SET vehicle_type_id = $1
         WHERE vehicle_type_id IS NULL AND deleted_at IS NULL`,
        [heavyDutyTypeId],
      );
      console.log('✓ Demo vehicles assigned vehicle_type_id: Heavy Duty 6/8 Tyres');
    }

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
    // Track every wallet touched across all trips for final reconciliation
    const touchedWalletIds = new Set<string>();

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

      // Look up loading/unloading fees from the vehicle's type
      const vtRes = await client.query<{ vehicle_type_id: string; loading_fee: number; unloading_fee: number }>(
        `SELECT v.vehicle_type_id, vt.loading_fee, vt.unloading_fee
         FROM vehicles v
         JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
         WHERE v.id = $1`,
        [vehicleId],
      );
      if (vtRes.rows.length === 0) {
        throw new Error(`Vehicle ${spec.vehicleReg} has no vehicle_type_id assigned`);
      }
      const { vehicle_type_id: vehicleTypeId, loading_fee: loadingFee, unloading_fee: unloadingFee } = vtRes.rows[0]!;

      // Load stakeholder rates for this vehicle type + active chart
      const srRes = await client.query<{ stakeholder_id: string; amount: string }>(
        `SELECT stakeholder_id, amount
         FROM pricing_chart_stakeholder_rates
         WHERE pricing_chart_id = $1 AND vehicle_type_id = $2`,
        [pricingChartId, vehicleTypeId],
      );
      const shRates = srRes.rows.map(r => ({
        stakeholderId: r.stakeholder_id,
        amount: Number(r.amount),
      }));

      // Upsert trip — ON CONFLICT DO NOTHING so events are not duplicated
      const insertTripRes = await client.query<{ id: string }>(
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

      let tripId: string;
      let isNew: boolean;
      if (insertTripRes.rows[0]) {
        tripId = insertTripRes.rows[0].id;
        isNew = true;
      } else {
        const existRes = await client.query<{ id: string }>(
          `SELECT id FROM trips WHERE trip_code = $1`,
          [spec.code],
        );
        tripId = existRes.rows[0]!.id;
        isNew = false;
      }

      // ── Per-trip transaction: delete old fees, re-insert with correct amounts ──
      await client.query('BEGIN');
      try {
        // 1. Get existing fees so we can undo their wallet effects
        const existingFees = await client.query<{
          id: string; recipient_type: string; recipient_id: string;
        }>(
          `SELECT id, recipient_type, recipient_id FROM trip_fees WHERE trip_id = $1`,
          [tripId],
        );

        for (const fee of existingFees.rows) {
          const wRes = await client.query<{ id: string; net: string }>(
            `SELECT w.id,
                    COALESCE(SUM(wl.amount), 0)::bigint AS net
             FROM wallets w
             LEFT JOIN wallet_ledger wl ON wl.wallet_id = w.id AND wl.trip_fee_id = $1
             WHERE w.owner_type = $2 AND w.owner_id = $3
             GROUP BY w.id`,
            [fee.id, fee.recipient_type, fee.recipient_id],
          );
          if (wRes.rows[0]) {
            const net = Number(wRes.rows[0].net);
            if (net !== 0) {
              await client.query(
                `UPDATE wallets SET total_collected = total_collected - $1 WHERE id = $2`,
                [net, wRes.rows[0].id],
              );
            }
            touchedWalletIds.add(wRes.rows[0].id);
          }
        }

        // 2. Delete ledger entries and fees for this trip
        await client.query(`DELETE FROM wallet_ledger WHERE trip_id = $1`, [tripId]);
        await client.query(`DELETE FROM trip_fees   WHERE trip_id = $1`, [tripId]);

        // 3. Re-insert fees using vehicle-type rates
        const loadFeeRes = await client.query<{ id: string }>(
          `INSERT INTO trip_fees (trip_id, recipient_type, recipient_id, fee_type, amount)
           VALUES ($1, 'state', $2, 'loading', $3) RETURNING id`,
          [tripId, loadStateId, loadingFee],
        );
        const loadFeeId = loadFeeRes.rows[0]!.id;

        const unloadFeeRes = await client.query<{ id: string }>(
          `INSERT INTO trip_fees (trip_id, recipient_type, recipient_id, fee_type, amount)
           VALUES ($1, 'state', $2, 'unloading', $3) RETURNING id`,
          [tripId, unloadStateId, unloadingFee],
        );
        const unloadFeeId = unloadFeeRes.rows[0]!.id;

        const shFees: { feeId: string; shId: string; amount: number }[] = [];
        for (const sr of shRates) {
          const sfRes = await client.query<{ id: string }>(
            `INSERT INTO trip_fees (trip_id, recipient_type, recipient_id, fee_type, amount)
             VALUES ($1, 'stakeholder', $2, 'stakeholder_fee', $3) RETURNING id`,
            [tripId, sr.stakeholderId, sr.amount],
          );
          shFees.push({ feeId: sfRes.rows[0]!.id, shId: sr.stakeholderId, amount: sr.amount });
        }

        // 4. Wallet credits
        const loadWalletId   = await getWalletId('state', loadStateId);
        const unloadWalletId = await getWalletId('state', unloadStateId);
        touchedWalletIds.add(loadWalletId);
        touchedWalletIds.add(unloadWalletId);

        await client.query(
          `INSERT INTO wallet_ledger (wallet_id, trip_id, trip_fee_id, amount, entry_type)
           VALUES ($1, $2, $3, $4, 'credit')`,
          [loadWalletId, tripId, loadFeeId, loadingFee],
        );
        await client.query(
          `UPDATE wallets SET total_collected = total_collected + $1 WHERE id = $2`,
          [loadingFee, loadWalletId],
        );

        await client.query(
          `INSERT INTO wallet_ledger (wallet_id, trip_id, trip_fee_id, amount, entry_type)
           VALUES ($1, $2, $3, $4, 'credit')`,
          [unloadWalletId, tripId, unloadFeeId, unloadingFee],
        );
        await client.query(
          `UPDATE wallets SET total_collected = total_collected + $1 WHERE id = $2`,
          [unloadingFee, unloadWalletId],
        );

        for (const sf of shFees) {
          const shWalletId = await getWalletId('stakeholder', sf.shId);
          touchedWalletIds.add(shWalletId);
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

        // 5. Reversals for cancelled trips (net to zero for this trip)
        if (spec.isCancelled) {
          await client.query(
            `INSERT INTO wallet_ledger (wallet_id, trip_id, trip_fee_id, amount, entry_type)
             VALUES ($1, $2, $3, $4, 'reversal')`,
            [loadWalletId, tripId, loadFeeId, -loadingFee],
          );
          await client.query(
            `UPDATE wallets SET total_collected = total_collected - $1 WHERE id = $2`,
            [loadingFee, loadWalletId],
          );

          await client.query(
            `INSERT INTO wallet_ledger (wallet_id, trip_id, trip_fee_id, amount, entry_type)
             VALUES ($1, $2, $3, $4, 'reversal')`,
            [unloadWalletId, tripId, unloadFeeId, -unloadingFee],
          );
          await client.query(
            `UPDATE wallets SET total_collected = total_collected - $1 WHERE id = $2`,
            [unloadingFee, unloadWalletId],
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

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }

      // 6. Trip events — only insert for newly created trips (idempotent)
      if (isNew) {
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
      }

      console.log(`  ✓ Trip ${spec.code} (${spec.status})${isNew ? '' : ' — fees re-seeded'}`);
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

    // ── Wallet reconciliation ──────────────────────────────────────────────
    console.log('\n── Wallet reconciliation ──');
    const failedWallets: string[] = [];
    for (const walletId of touchedWalletIds) {
      const rec = await client.query<{
        stored: string; ledger_sum: string; owner_type: string; owner_id: string;
      }>(
        `SELECT w.total_collected::bigint AS stored,
                COALESCE(SUM(wl.amount), 0)::bigint AS ledger_sum,
                w.owner_type,
                w.owner_id
         FROM wallets w
         LEFT JOIN wallet_ledger wl ON wl.wallet_id = w.id
         WHERE w.id = $1
         GROUP BY w.id, w.total_collected, w.owner_type, w.owner_id`,
        [walletId],
      );
      const row = rec.rows[0]!;
      const stored    = Number(row.stored);
      const ledgerSum = Number(row.ledger_sum);
      if (stored !== ledgerSum) {
        failedWallets.push(
          `wallet ${walletId} (${row.owner_type}/${row.owner_id}): stored=${stored}, ledger_sum=${ledgerSum}`,
        );
      }
    }
    if (failedWallets.length > 0) {
      throw new Error(`Reconciliation failed:\n${failedWallets.join('\n')}`);
    }
    console.log(`✓ Reconciliation passed: ${touchedWalletIds.size} wallets verified`);

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
