import { type Request, type Response } from "express";
import pool from "../db/connection.js";

interface CreateTripBody {
  vehicleId?: unknown;
  driverId?: unknown;
  loadingStateId?: unknown;
  unloadingStateId?: unknown;
  originDescription?: unknown;
  destinationDescription?: unknown;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createTrip(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateTripBody;

  // ── 1. Basic type/presence checks ──────────────────────────────────────────
  const vehicleId = body.vehicleId;
  const driverId = body.driverId;
  const loadingStateId = body.loadingStateId;
  const unloadingStateId = body.unloadingStateId;
  const originDescription = body.originDescription;
  const destinationDescription = body.destinationDescription;

  if (!vehicleId || typeof vehicleId !== "string" || vehicleId.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "vehicleId is required" });
    return;
  }
  if (!UUID_RE.test(vehicleId)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "vehicleId must be a valid UUID" });
    return;
  }
  if (!driverId || typeof driverId !== "string") {
    res.status(400).json({ error: "BAD_REQUEST", message: "driverId is required" });
    return;
  }
  if (!UUID_RE.test(driverId)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "driverId must be a valid UUID" });
    return;
  }
  if (!loadingStateId || typeof loadingStateId !== "string") {
    res.status(400).json({ error: "BAD_REQUEST", message: "loadingStateId is required" });
    return;
  }
  if (!UUID_RE.test(loadingStateId)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "loadingStateId must be a valid UUID" });
    return;
  }
  if (!unloadingStateId || typeof unloadingStateId !== "string") {
    res.status(400).json({ error: "BAD_REQUEST", message: "unloadingStateId is required" });
    return;
  }
  if (!UUID_RE.test(unloadingStateId)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "unloadingStateId must be a valid UUID" });
    return;
  }

  // ── 1.5. Role-based origin state enforcement ────────────────────────────────
  if (req.user!.role === "trip_admin") {
    if (loadingStateId !== req.user!.entityId) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: "You can only create trips originating from your own registered state.",
      });
      return;
    }
  }

  // ── 2. DB existence checks ──────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    // Look up vehicle and its type in one query
    const vehicleRes = await client.query<{
      id: string;
      registration_number: string;
      vehicle_type_id: string | null;
      loading_fee: number | null;
      unloading_fee: number | null;
      vehicle_type_name: string | null;
      vehicle_type_is_active: boolean | null;
    }>(
      `SELECT
         v.id,
         v.registration_number,
         v.vehicle_type_id,
         vt.loading_fee,
         vt.unloading_fee,
         vt.name AS vehicle_type_name,
         vt.is_active AS vehicle_type_is_active
       FROM vehicles v
       LEFT JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
       WHERE v.id = $1 AND v.is_active = true AND v.deleted_at IS NULL
       LIMIT 1`,
      [vehicleId]
    );

    if (vehicleRes.rows.length === 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "vehicleId does not reference an active vehicle" });
      return;
    }

    const vehicle = vehicleRes.rows[0]!;

    if (!vehicle.vehicle_type_id || vehicle.loading_fee === null || vehicle.unloading_fee === null) {
      res.status(422).json({
        error: "UNPROCESSABLE",
        message: "Vehicle has no type assigned. Please contact your administrator.",
      });
      return;
    }

    if (vehicle.vehicle_type_is_active === false) {
      res.status(422).json({
        error: "UNPROCESSABLE",
        message: "This vehicle's type is no longer active. Please reassign this vehicle to a different vehicle type before creating a trip.",
      });
      return;
    }

    const loadingFeeAmount   = vehicle.loading_fee;
    const unloadingFeeAmount = vehicle.unloading_fee;
    const vehicleTypeId      = vehicle.vehicle_type_id;
    const vehicleTypeName    = vehicle.vehicle_type_name!;

    // Run remaining existence checks in parallel
    const [driverRes, loadingRes, unloadingRes] = await Promise.all([
      client.query<{ id: string }>(
        `SELECT id FROM drivers WHERE id = $1 AND is_active = true AND deleted_at IS NULL LIMIT 1`,
        [driverId]
      ),
      client.query<{ id: string }>(
        `SELECT id FROM states WHERE id = $1 LIMIT 1`,
        [loadingStateId]
      ),
      client.query<{ id: string }>(
        `SELECT id FROM states WHERE id = $1 LIMIT 1`,
        [unloadingStateId]
      ),
    ]);

    if (driverRes.rows.length === 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "driverId does not reference an active driver" });
      return;
    }
    if (loadingRes.rows.length === 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "loadingStateId does not reference an existing state" });
      return;
    }
    if (unloadingRes.rows.length === 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "unloadingStateId does not reference an existing state" });
      return;
    }

    // Fetch active pricing chart
    const chartRes = await client.query<{ id: string }>(
      `SELECT id FROM pricing_charts WHERE is_active = true LIMIT 1`
    );
    if (chartRes.rows.length === 0) {
      res.status(422).json({
        error: "UNPROCESSABLE",
        message: "No active pricing chart. Please contact your Super Admin.",
      });
      return;
    }
    const chartId = chartRes.rows[0]!.id;

    // Fetch stakeholder rates for this vehicle type from the active chart (active stakeholders only)
    const ratesRes = await client.query<{
      stakeholder_id: string;
      amount: number;
    }>(
      `SELECT pcsr.stakeholder_id, pcsr.amount
       FROM pricing_chart_stakeholder_rates pcsr
       JOIN stakeholders s ON s.id = pcsr.stakeholder_id AND s.is_active = true
       WHERE pcsr.pricing_chart_id = $1 AND pcsr.vehicle_type_id = $2`,
      [chartId, vehicleTypeId]
    );

    // ── 3. Duplicate active vehicle check ──────────────────────────────────
    const dupRes = await client.query<{ id: string }>(
      `SELECT id FROM trips
       WHERE vehicle_id = $1
         AND status IN ('created', 'in_transit')
         AND deleted_at IS NULL
       LIMIT 1`,
      [vehicleId]
    );
    if (dupRes.rows.length > 0) {
      res.status(409).json({ error: "CONFLICT", message: "Vehicle already has an active trip" });
      return;
    }

    // ── 4. Transaction: insert trip, fees, wallets, event ─────────────────
    await client.query("BEGIN");

    const { rows: [seqRow] } = await client.query<{ nextval: string }>(
      `SELECT nextval('trip_code_seq') AS nextval`
    );
    const tripCodeYear = new Date().getFullYear();
    const tripCode = `SYN-${tripCodeYear}-${String(seqRow!.nextval).padStart(6, "0")}`;

    const createdById = req.user!.userId;

    // STEP A: Insert trip
    const { rows: [trip] } = await client.query<{
      id: string;
      trip_code: string;
      vehicle_id: string;
      driver_id: string | null;
      loading_state_id: string;
      unloading_state_id: string;
      origin_description: string | null;
      destination_description: string | null;
      status: string;
      created_by: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO trips
         (vehicle_id, driver_id, loading_state_id, unloading_state_id,
          origin_description, destination_description, created_by, trip_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        vehicleId,
        driverId,
        loadingStateId,
        unloadingStateId,
        typeof originDescription === "string" ? originDescription : null,
        typeof destinationDescription === "string" ? destinationDescription : null,
        createdById,
        tripCode,
      ]
    );

    // STEP B: Build fee entries
    type FeeRow = {
      recipientType: "state" | "stakeholder";
      recipientId: string;
      feeType: "loading" | "unloading" | "stakeholder_fee";
      amount: number;
    };

    const feeEntries: FeeRow[] = [
      { recipientType: "state", recipientId: loadingStateId, feeType: "loading", amount: loadingFeeAmount },
      { recipientType: "state", recipientId: unloadingStateId, feeType: "unloading", amount: unloadingFeeAmount },
    ];

    // Only include stakeholder fees where amount > 0
    for (const rate of ratesRes.rows) {
      if (rate.amount > 0) {
        feeEntries.push({
          recipientType: "stakeholder",
          recipientId: rate.stakeholder_id,
          feeType: "stakeholder_fee",
          amount: rate.amount,
        });
      }
    }

    const feesAllocated: Array<{
      id: string;
      recipientType: string;
      recipientId: string;
      feeType: string;
      amount: number;
    }> = [];

    let walletsUpdated = 0;
    let totalFees = 0;

    for (const entry of feeEntries) {
      // Insert trip_fee
      const { rows: [fee] } = await client.query<{
        id: string;
        trip_id: string;
        recipient_type: string;
        recipient_id: string;
        fee_type: string;
        amount: number;
      }>(
        `INSERT INTO trip_fees (trip_id, recipient_type, recipient_id, fee_type, amount)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [trip!.id, entry.recipientType, entry.recipientId, entry.feeType, entry.amount]
      );

      feesAllocated.push({
        id: fee!.id,
        recipientType: fee!.recipient_type,
        recipientId: fee!.recipient_id,
        feeType: fee!.fee_type,
        amount: fee!.amount,
      });

      totalFees += entry.amount;

      // Credit wallet
      const walletUpdate = await client.query(
        `UPDATE wallets
         SET total_collected = total_collected + $1,
             updated_at = NOW()
         WHERE owner_type = $2 AND owner_id = $3`,
        [entry.amount, entry.recipientType, entry.recipientId]
      );
      if ((walletUpdate.rowCount ?? 0) !== 1) {
        throw new Error(
          `Wallet not found for ${entry.recipientType} ${entry.recipientId} — cannot credit fee`
        );
      }

      // Ledger entry
      const ledgerInsert = await client.query(
        `INSERT INTO wallet_ledger
           (wallet_id, trip_id, trip_fee_id, amount, entry_type, cleared)
         SELECT w.id, $1, $2, $3, 'credit', false
         FROM wallets w
         WHERE w.owner_type = $4 AND w.owner_id = $5`,
        [trip!.id, fee!.id, entry.amount, entry.recipientType, entry.recipientId]
      );
      if ((ledgerInsert.rowCount ?? 0) !== 1) {
        throw new Error(
          `Ledger insert failed for ${entry.recipientType} ${entry.recipientId}`
        );
      }

      walletsUpdated += walletUpdate.rowCount ?? 0;
    }

    // STEP C: Trip event
    await client.query(
      `INSERT INTO trip_events (trip_id, event_type, performed_by, metadata)
       VALUES ($1, 'created', $2, $3::jsonb)`,
      [
        trip!.id,
        createdById,
        JSON.stringify({
          vehicleNumber: vehicle.registration_number,
          vehicleId,
          vehicleTypeId,
          vehicleTypeName,
          loadingStateId,
          unloadingStateId,
          totalFees,
        }),
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      data: {
        trip: {
          id:              trip!.id,
          tripCode:        trip!.trip_code,
          vehicleNumber:   vehicle.registration_number,
          vehicleTypeId,
          vehicleTypeName,
          status:          trip!.status,
          loadingStateId:  trip!.loading_state_id,
          unloadingStateId: trip!.unloading_state_id,
          createdAt:       trip!.created_at,
        },
        feesAllocated,
        walletsUpdated,
      },
      message: "Trip created and fees allocated",
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create trip" });
  } finally {
    client.release();
  }
}

export async function startTrip(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params as { tripId: string };
  const callerId = req.user!.userId;

  try {
    const { rows } = await pool.query<{
      id: string;
      created_by: string;
      status: string;
    }>(
      `SELECT id, created_by, status FROM trips WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [tripId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Trip not found" });
      return;
    }

    const trip = rows[0]!;

    if (trip.created_by !== callerId) {
      res.status(403).json({ error: "FORBIDDEN", message: "You did not create this trip" });
      return;
    }

    if (trip.status !== "created") {
      res.status(409).json({ error: "CONFLICT", message: "Trip cannot be started from its current status" });
      return;
    }

    await pool.query(
      `UPDATE trips SET status = 'in_transit', updated_at = NOW() WHERE id = $1`,
      [tripId]
    );

    const { rows: [event] } = await pool.query<{ created_at: Date }>(
      `INSERT INTO trip_events (trip_id, event_type, performed_by, metadata)
       VALUES ($1, 'started', $2, $3::jsonb)
       RETURNING created_at`,
      [tripId, callerId, JSON.stringify({ previousStatus: "created" })]
    );

    res.json({
      data: {
        tripId,
        status: "in_transit",
        startedAt: event!.created_at,
      },
      message: "Trip started",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to start trip" });
  }
}

export async function completeTrip(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params as { tripId: string };
  const callerId = req.user!.userId;

  try {
    const { rows } = await pool.query<{
      id: string;
      created_by: string;
      status: string;
    }>(
      `SELECT id, created_by, status FROM trips WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [tripId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Trip not found" });
      return;
    }

    const trip = rows[0]!;

    if (trip.created_by !== callerId) {
      res.status(403).json({ error: "FORBIDDEN", message: "You did not create this trip" });
      return;
    }

    if (trip.status !== "in_transit") {
      res.status(409).json({ error: "CONFLICT", message: "Trip cannot be completed from its current status" });
      return;
    }

    await pool.query(
      `UPDATE trips SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [tripId]
    );

    const { rows: [event] } = await pool.query<{ created_at: Date }>(
      `INSERT INTO trip_events (trip_id, event_type, performed_by, metadata)
       VALUES ($1, 'completed', $2, $3::jsonb)
       RETURNING created_at`,
      [tripId, callerId, JSON.stringify({ previousStatus: "in_transit" })]
    );

    res.json({
      data: {
        tripId,
        status: "completed",
        completedAt: event!.created_at,
      },
      message: "Trip completed",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to complete trip" });
  }
}

export async function listTrips(req: Request, res: Response): Promise<void> {
  const role   = req.user!.role;
  const userId = req.user!.userId;

  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const rawPage  = parseInt((req.query.page  as string) ?? "1",  10);
  const rawLimit = parseInt((req.query.limit as string) ?? "20", 10);
  const page   = Number.isFinite(rawPage)  && rawPage  > 0 ? rawPage            : 1;
  const limit  = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
  const offset = (page - 1) * limit;

  const validStatuses = ["created", "in_transit", "completed", "cancelled"];
  if (statusFilter && !validStatuses.includes(statusFilter)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "Invalid status filter" });
    return;
  }

  try {
    const isSuperAdmin = role === "super_admin";
    const isTripAdmin  = role === "trip_admin";
    const params: unknown[] = [];
    let idx = 1;
    const conditions: string[] = [];

    if (isTripAdmin) {
      const entityId = req.user!.entityId;
      params.push(entityId);
      params.push(userId);
      conditions.push(`(t.loading_state_id = $${idx++} OR t.created_by = $${idx++})`);
    } else if (role === "state_admin") {
      const entityId = req.user!.entityId;
      params.push(entityId);
      conditions.push(`t.loading_state_id = $${idx++}`);
    } else if (!isSuperAdmin) {
      params.push(userId);
      conditions.push(`t.driver_id = $${idx++}`);
    }
    if (statusFilter) {
      params.push(statusFilter);
      conditions.push(`t.status = $${idx++}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const baseFrom = `
      FROM trips t
      JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
      JOIN states ls ON t.loading_state_id   = ls.id
      JOIN states us ON t.unloading_state_id = us.id
      LEFT JOIN users d ON t.driver_id = d.id
      LEFT JOIN users u ON u.id = t.created_by
      ${whereClause}`;

    const [countRes, unstartedRes, rowsRes] = await Promise.all([
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total ${baseFrom}`,
        params
      ),
      isSuperAdmin
        ? pool.query<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM trips
             WHERE status = 'created'
               AND created_at < NOW() - INTERVAL '2 hours'`
          )
        : Promise.resolve(null),
      pool.query<{
        id:                    string;
        vehicle_number:        string;
        vehicle_type_id:       string | null;
        vehicle_type_name:     string | null;
        status:                string;
        origin_description:    string | null;
        destination_description: string | null;
        created_at:            Date;
        updated_at:            Date;
        loading_state_id:      string;
        loading_state_name:    string;
        loading_state_code:    string;
        unloading_state_id:    string;
        unloading_state_name:  string;
        unloading_state_code:  string;
        driver_id:             string | null;
        driver_email:          string | null;
        unstarted_flag:        boolean | null;
        created_by_name:       string | null;
        created_by_email:      string | null;
      }>(
        `SELECT
           t.id,
           v.registration_number AS vehicle_number,
           v.vehicle_type_id,
           vt.name AS vehicle_type_name,
           t.status,
           t.origin_description,
           t.destination_description,
           t.created_at,
           t.updated_at,
           ls.id   AS loading_state_id,
           ls.name AS loading_state_name,
           ls.code AS loading_state_code,
           us.id   AS unloading_state_id,
           us.name AS unloading_state_name,
           us.code AS unloading_state_code,
           d.id    AS driver_id,
           d.email AS driver_email,
           ${isSuperAdmin
             ? "(t.status = 'created' AND t.created_at < NOW() - INTERVAL '2 hours')"
             : "NULL"
           } AS unstarted_flag,
           u.first_name || ' ' || u.last_name AS created_by_name,
           u.email AS created_by_email
         ${baseFrom}
         ORDER BY t.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
    ]);

    const total        = parseInt(countRes.rows[0]!.total, 10);
    const totalPages   = Math.ceil(total / limit);
    const unstartedCount = isSuperAdmin
      ? parseInt(unstartedRes!.rows[0]!.count, 10)
      : null;

    res.json({
      data: {
        trips: rowsRes.rows.map((r) => ({
          id:              r.id,
          vehicleNumber:   r.vehicle_number,
          vehicleTypeId:   r.vehicle_type_id,
          vehicleTypeName: r.vehicle_type_name,
          status:          r.status,
          loadingState:    { id: r.loading_state_id,   name: r.loading_state_name,   code: r.loading_state_code   },
          unloadingState:  { id: r.unloading_state_id, name: r.unloading_state_name, code: r.unloading_state_code },
          driver:          r.driver_id ? { id: r.driver_id, email: r.driver_email } : null,
          originDescription:      r.origin_description,
          destinationDescription: r.destination_description,
          unstartedFlag:   isSuperAdmin ? (r.unstarted_flag ?? false) : null,
          createdByName:   r.created_by_name,
          createdByEmail:  r.created_by_email,
          createdAt:       r.created_at,
          updatedAt:       r.updated_at,
        })),
        pagination:    { page, limit, total, totalPages },
        unstartedCount,
      },
      message: "Trips retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve trips" });
  }
}

export async function getTripById(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params as { tripId: string };
  console.log(`[getTripById] path=${req.path} originalUrl=${req.originalUrl} tripId=${tripId}`);
  const role   = req.user!.role;
  const userId = req.user!.userId;

  try {
    const { rows } = await pool.query<{
      id:                    string;
      trip_code:             string | null;
      vehicle_number:        string;
      vehicle_type_id:       string | null;
      vehicle_type_name:     string | null;
      status:                string;
      origin_description:    string | null;
      destination_description: string | null;
      created_at:            Date;
      updated_at:            Date;
      driver_id:             string | null;
      driver_email:          string | null;
      loading_state_id:      string;
      loading_state_name:    string;
      loading_state_code:    string;
      unloading_state_id:    string;
      unloading_state_name:  string;
      unloading_state_code:  string;
      unstarted_flag:        boolean;
      created_by_name:       string | null;
      created_by_email:      string | null;
    }>(
      `SELECT
         t.id,
         t.trip_code,
         v.registration_number AS vehicle_number,
         v.vehicle_type_id,
         vt.name AS vehicle_type_name,
         t.status,
         t.origin_description,
         t.destination_description,
         t.created_at,
         t.updated_at,
         d.id    AS driver_id,
         d.email AS driver_email,
         ls.id   AS loading_state_id,
         ls.name AS loading_state_name,
         ls.code AS loading_state_code,
         us.id   AS unloading_state_id,
         us.name AS unloading_state_name,
         us.code AS unloading_state_code,
         (t.status = 'created' AND t.created_at < NOW() - INTERVAL '2 hours') AS unstarted_flag,
         u.first_name || ' ' || u.last_name AS created_by_name,
         u.email AS created_by_email
       FROM trips t
       JOIN vehicles v ON t.vehicle_id = v.id
       LEFT JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
       JOIN states ls ON t.loading_state_id   = ls.id
       JOIN states us ON t.unloading_state_id = us.id
       LEFT JOIN users d ON t.driver_id = d.id
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.id = $1
       LIMIT 1`,
      [tripId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Trip not found" });
      return;
    }

    const trip = rows[0]!;

    // Role-based access: trip_admins see any trip in their state or any trip they created
    if (role === "trip_admin") {
      const entityId = req.user!.entityId;
      const creatorCheck = await pool.query<{ created_by: string }>(
        `SELECT created_by FROM trips WHERE id = $1`,
        [tripId]
      );
      const createdBy = creatorCheck.rows[0]?.created_by;
      if (trip.loading_state_id !== entityId && createdBy !== userId) {
        res.status(403).json({ error: "FORBIDDEN", message: "Access denied" });
        return;
      }
    } else if (role === "state_admin") {
      const entityId = req.user!.entityId;
      if (trip.loading_state_id !== entityId) {
        res.status(403).json({ error: "FORBIDDEN", message: "Access denied" });
        return;
      }
    }

    // Fetch fees for this trip
    const feesRes = await pool.query<{
      id:             string;
      recipient_type: string;
      recipient_id:   string;
      fee_type:       string;
      amount:         number;
      recipient_name: string | null;
    }>(
      `SELECT
         tf.id,
         tf.recipient_type,
         tf.recipient_id,
         tf.fee_type,
         tf.amount,
         COALESCE(s.name, sh.name) AS recipient_name
       FROM trip_fees tf
       LEFT JOIN states       s  ON tf.recipient_type = 'state'       AND s.id  = tf.recipient_id
       LEFT JOIN stakeholders sh ON tf.recipient_type = 'stakeholder' AND sh.id = tf.recipient_id
       WHERE tf.trip_id = $1
       ORDER BY tf.fee_type`,
      [tripId]
    );

    // Fetch events for this trip
    const eventsRes = await pool.query<{
      id:           string;
      event_type:   string;
      performed_by: string | null;
      metadata:     Record<string, unknown> | null;
      created_at:   Date;
    }>(
      `SELECT id, event_type, performed_by, metadata, created_at
       FROM trip_events
       WHERE trip_id = $1
       ORDER BY created_at ASC`,
      [tripId]
    );

    res.json({
      data: {
        trip: {
          id:              trip.id,
          tripCode:        trip.trip_code,
          vehicleNumber:   trip.vehicle_number,
          vehicleTypeId:   trip.vehicle_type_id,
          vehicleTypeName: trip.vehicle_type_name,
          status:          trip.status,
          loadingState:    { id: trip.loading_state_id,   name: trip.loading_state_name,   code: trip.loading_state_code   },
          unloadingState:  { id: trip.unloading_state_id, name: trip.unloading_state_name, code: trip.unloading_state_code },
          driver:          trip.driver_id ? { id: trip.driver_id, email: trip.driver_email } : null,
          originDescription:      trip.origin_description,
          destinationDescription: trip.destination_description,
          unstartedFlag:   trip.unstarted_flag,
          createdByName:   trip.created_by_name,
          createdByEmail:  trip.created_by_email,
          createdAt:       trip.created_at,
          updatedAt:       trip.updated_at,
          fees:            feesRes.rows.map((f) => ({
            id:            f.id,
            recipientType: f.recipient_type,
            recipientId:   f.recipient_id,
            recipientName: f.recipient_name,
            feeType:       f.fee_type,
            amount:        f.amount,
          })),
          events:          eventsRes.rows.map((e) => ({
            id:          e.id,
            eventType:   e.event_type,
            performedBy: e.performed_by,
            metadata:    e.metadata,
            createdAt:   e.created_at,
          })),
        },
      },
      message: "Trip retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve trip" });
  }
}
