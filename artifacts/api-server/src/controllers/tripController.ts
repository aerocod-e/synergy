import { type Request, type Response } from "express";
import pool from "../db/connection.js";

interface StakeholderInput {
  stakeholderId: string;
  amount: number;
  enabled: boolean;
}

interface FeesInput {
  loadingFee: number;
  unloadingFee: number;
  stakeholders: StakeholderInput[];
}

interface CreateTripBody {
  vehicleNumber?: unknown;
  driverId?: unknown;
  loadingStateId?: unknown;
  unloadingStateId?: unknown;
  originDescription?: unknown;
  destinationDescription?: unknown;
  fees?: unknown;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

export async function createTrip(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateTripBody;

  // ── 1. Basic type/presence checks ──────────────────────────────────────────
  const vehicleNumber = body.vehicleNumber;
  const driverId = body.driverId;
  const loadingStateId = body.loadingStateId;
  const unloadingStateId = body.unloadingStateId;
  const originDescription = body.originDescription;
  const destinationDescription = body.destinationDescription;
  const fees = body.fees as FeesInput | undefined;

  if (!vehicleNumber || typeof vehicleNumber !== "string" || vehicleNumber.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "vehicleNumber must not be empty" });
    return;
  }
  if (!driverId || typeof driverId !== "string") {
    res.status(400).json({ error: "BAD_REQUEST", message: "driverId is required" });
    return;
  }
  if (!loadingStateId || typeof loadingStateId !== "string") {
    res.status(400).json({ error: "BAD_REQUEST", message: "loadingStateId is required" });
    return;
  }
  if (!unloadingStateId || typeof unloadingStateId !== "string") {
    res.status(400).json({ error: "BAD_REQUEST", message: "unloadingStateId is required" });
    return;
  }
  if (!fees || typeof fees !== "object") {
    res.status(400).json({ error: "BAD_REQUEST", message: "fees object is required" });
    return;
  }
  if (!isPositiveInt(fees.loadingFee)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "fees.loadingFee must be a positive integer (kobo)" });
    return;
  }
  if (!isPositiveInt(fees.unloadingFee)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "fees.unloadingFee must be a positive integer (kobo)" });
    return;
  }

  if (!Array.isArray(fees.stakeholders)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "fees.stakeholders must be an array" });
    return;
  }
  const enabledStakeholders = fees.stakeholders.filter((s) => s.enabled);
  for (const s of enabledStakeholders) {
    if (!s.stakeholderId || typeof s.stakeholderId !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Each enabled stakeholder must have a valid stakeholderId" });
      return;
    }
    if (!isPositiveInt(s.amount)) {
      res.status(400).json({ error: "BAD_REQUEST", message: `Stakeholder ${s.stakeholderId}: amount must be a positive integer (kobo)` });
      return;
    }
  }

  // ── 2. DB existence checks (run in parallel before opening transaction) ────
  const client = await pool.connect();
  try {
    const [driverRes, loadingRes, unloadingRes, ...stakeholderResults] =
      await Promise.all([
        client.query<{ id: string }>(
          `SELECT id FROM users WHERE id = $1 AND role = 'driver' AND is_active = true AND deleted_at IS NULL LIMIT 1`,
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
        ...enabledStakeholders.map((s) =>
          client.query<{ id: string }>(
            `SELECT id FROM stakeholders WHERE id = $1 AND is_active = true LIMIT 1`,
            [s.stakeholderId]
          )
        ),
      ]);

    if (driverRes.rows.length === 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "driverId does not reference an active driver user" });
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
    for (let i = 0; i < enabledStakeholders.length; i++) {
      if (stakeholderResults[i]!.rows.length === 0) {
        res.status(400).json({ error: "BAD_REQUEST", message: `stakeholderId ${enabledStakeholders[i]!.stakeholderId} does not reference an existing active stakeholder` });
        return;
      }
    }

    // ── 3. Duplicate active vehicle check ──────────────────────────────────
    const dupRes = await client.query<{ id: string }>(
      `SELECT id FROM trips
       WHERE vehicle_number = $1
         AND status IN ('created', 'in_transit')
         AND deleted_at IS NULL
       LIMIT 1`,
      [vehicleNumber.trim()]
    );
    if (dupRes.rows.length > 0) {
      res.status(409).json({ error: "CONFLICT", message: "Vehicle already has an active trip" });
      return;
    }

    // ── 4–7. Transaction: insert trip, fees, wallets, event ───────────────
    await client.query("BEGIN");

    const createdById = req.user!.userId;

    // STEP A: Insert trip
    const { rows: [trip] } = await client.query<{
      id: string;
      vehicle_number: string;
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
         (vehicle_number, driver_id, loading_state_id, unloading_state_id,
          origin_description, destination_description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        vehicleNumber.trim(),
        driverId,
        loadingStateId,
        unloadingStateId,
        typeof originDescription === "string" ? originDescription : null,
        typeof destinationDescription === "string" ? destinationDescription : null,
        createdById,
      ]
    );

    // STEP B: Build fee entries — always TWO state rows even when same state
    type FeeRow = {
      recipientType: "state" | "stakeholder";
      recipientId: string;
      feeType: "loading" | "unloading" | "stakeholder_fee";
      amount: number;
    };

    const feeEntries: FeeRow[] = [
      { recipientType: "state", recipientId: loadingStateId, feeType: "loading", amount: fees.loadingFee },
      { recipientType: "state", recipientId: unloadingStateId, feeType: "unloading", amount: fees.unloadingFee },
      ...enabledStakeholders.map((s): FeeRow => ({
        recipientType: "stakeholder",
        recipientId: s.stakeholderId,
        feeType: "stakeholder_fee",
        amount: s.amount,
      })),
    ];

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
        [trip.id, entry.recipientType, entry.recipientId, entry.feeType, entry.amount]
      );

      feesAllocated.push({
        id: fee.id,
        recipientType: fee.recipient_type,
        recipientId: fee.recipient_id,
        feeType: fee.fee_type,
        amount: fee.amount,
      });

      totalFees += entry.amount;

      // STEP C: Credit wallet + ledger entry — both must match exactly 1 row
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

      const ledgerInsert = await client.query(
        `INSERT INTO wallet_ledger
           (wallet_id, trip_id, trip_fee_id, amount, entry_type, cleared)
         SELECT w.id, $1, $2, $3, 'credit', false
         FROM wallets w
         WHERE w.owner_type = $4 AND w.owner_id = $5`,
        [trip.id, fee.id, entry.amount, entry.recipientType, entry.recipientId]
      );
      if ((ledgerInsert.rowCount ?? 0) !== 1) {
        throw new Error(
          `Ledger insert failed for ${entry.recipientType} ${entry.recipientId}`
        );
      }

      walletsUpdated += walletUpdate.rowCount ?? 0;
    }

    // STEP D: Trip event
    await client.query(
      `INSERT INTO trip_events (trip_id, event_type, performed_by, metadata)
       VALUES ($1, 'created', $2, $3::jsonb)`,
      [
        trip.id,
        createdById,
        JSON.stringify({
          vehicleNumber: vehicleNumber.trim(),
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
          id: trip.id,
          vehicleNumber: trip.vehicle_number,
          status: trip.status,
          loadingStateId: trip.loading_state_id,
          unloadingStateId: trip.unloading_state_id,
          createdAt: trip.created_at,
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
      driver_id: string | null;
      status: string;
    }>(
      `SELECT id, driver_id, status FROM trips WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [tripId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Trip not found" });
      return;
    }

    const trip = rows[0]!;

    if (trip.driver_id !== callerId) {
      res.status(403).json({ error: "FORBIDDEN", message: "You are not assigned to this trip" });
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
      driver_id: string | null;
      status: string;
    }>(
      `SELECT id, driver_id, status FROM trips WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [tripId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Trip not found" });
      return;
    }

    const trip = rows[0]!;

    if (trip.driver_id !== callerId) {
      res.status(403).json({ error: "FORBIDDEN", message: "You are not assigned to this trip" });
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

export async function cancelTrip(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params as { tripId: string };
  const callerId = req.user!.userId;

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      id: string;
      status: string;
    }>(
      `SELECT id, status FROM trips WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [tripId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Trip not found" });
      return;
    }

    const trip = rows[0]!;

    if (trip.status === "cancelled" || trip.status === "completed") {
      res.status(409).json({ error: "CONFLICT", message: "Trip cannot be cancelled from its current status" });
      return;
    }

    const previousStatus = trip.status;

    // Fetch all credit ledger entries for this trip
    const { rows: creditEntries } = await client.query<{
      id: string;
      wallet_id: string;
      trip_fee_id: string;
      amount: number;
    }>(
      `SELECT id, wallet_id, trip_fee_id, amount
       FROM wallet_ledger
       WHERE trip_id = $1 AND entry_type = 'credit'`,
      [tripId]
    );

    await client.query("BEGIN");

    let reversedEntries = 0;
    let walletsRestored = 0;

    // STEP A: Reverse each credit
    for (const entry of creditEntries) {
      await client.query(
        `INSERT INTO wallet_ledger
           (wallet_id, trip_id, trip_fee_id, amount, entry_type, cleared)
         VALUES ($1, $2, $3, $4, 'reversal', false)`,
        [entry.wallet_id, tripId, entry.trip_fee_id, -entry.amount]
      );
      reversedEntries++;

      const walletRes = await client.query(
        `UPDATE wallets
         SET total_collected = total_collected - $1,
             updated_at = NOW()
         WHERE id = $2`,
        [entry.amount, entry.wallet_id]
      );
      if ((walletRes.rowCount ?? 0) !== 1) {
        throw new Error(`Wallet update failed for wallet ${entry.wallet_id}`);
      }
      walletsRestored += walletRes.rowCount ?? 0;
    }

    // STEP B: Soft-cancel the trip
    await client.query(
      `UPDATE trips
       SET status = 'cancelled', deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [tripId]
    );

    // STEP C: Insert cancellation event
    await client.query(
      `INSERT INTO trip_events (trip_id, event_type, performed_by, metadata)
       VALUES ($1, 'cancelled', $2, $3::jsonb)`,
      [
        tripId,
        callerId,
        JSON.stringify({ previousStatus, reversedEntries }),
      ]
    );

    await client.query("COMMIT");

    res.json({
      data: {
        tripId,
        status: "cancelled",
        reversedEntries,
        walletsRestored,
      },
      message: "Trip cancelled and wallets reversed",
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to cancel trip" });
  } finally {
    client.release();
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
    const params: unknown[] = [];
    let idx = 1;
    const conditions: string[] = [];

    if (!isSuperAdmin) {
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
      JOIN states ls ON t.loading_state_id   = ls.id
      JOIN states us ON t.unloading_state_id = us.id
      LEFT JOIN users d ON t.driver_id = d.id
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
      }>(
        `SELECT
           t.id,
           t.vehicle_number,
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
           } AS unstarted_flag
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
          status:          r.status,
          loadingState:    { id: r.loading_state_id,   name: r.loading_state_name,   code: r.loading_state_code   },
          unloadingState:  { id: r.unloading_state_id, name: r.unloading_state_name, code: r.unloading_state_code },
          driver:          r.driver_id ? { id: r.driver_id, email: r.driver_email } : null,
          originDescription:      r.origin_description,
          destinationDescription: r.destination_description,
          unstartedFlag:   isSuperAdmin ? (r.unstarted_flag ?? false) : null,
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
      vehicle_number:        string;
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
    }>(
      `SELECT
         t.id,
         t.vehicle_number,
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
         (t.status = 'created' AND t.created_at < NOW() - INTERVAL '2 hours') AS unstarted_flag
       FROM trips t
       JOIN states ls ON t.loading_state_id   = ls.id
       JOIN states us ON t.unloading_state_id = us.id
       LEFT JOIN users d ON t.driver_id = d.id
       WHERE t.id = $1
       LIMIT 1`,
      [tripId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Trip not found" });
      return;
    }

    const trip = rows[0]!;

    if (role === "driver" && trip.driver_id !== userId) {
      res.status(403).json({ error: "FORBIDDEN", message: "You are not assigned to this trip" });
      return;
    }

    const [feesRes, eventsRes] = await Promise.all([
      pool.query<{
        id:             string;
        recipient_type: string;
        recipient_id:   string;
        fee_type:       string;
        amount:         number;
      }>(
        `SELECT id, recipient_type, recipient_id, fee_type, amount
         FROM trip_fees
         WHERE trip_id = $1
         ORDER BY fee_type`,
        [tripId]
      ),
      pool.query<{
        id:                  string;
        event_type:          string;
        performed_by_email:  string | null;
        metadata:            Record<string, unknown>;
        created_at:          Date;
      }>(
        `SELECT te.id, te.event_type, u.email AS performed_by_email, te.metadata, te.created_at
         FROM trip_events te
         LEFT JOIN users u ON te.performed_by = u.id
         WHERE te.trip_id = $1
         ORDER BY te.created_at ASC`,
        [tripId]
      ),
    ]);

    res.json({
      data: {
        trip: {
          id:              trip.id,
          vehicleNumber:   trip.vehicle_number,
          status:          trip.status,
          loadingState:    { id: trip.loading_state_id,   name: trip.loading_state_name,   code: trip.loading_state_code   },
          unloadingState:  { id: trip.unloading_state_id, name: trip.unloading_state_name, code: trip.unloading_state_code },
          driver:          trip.driver_id ? { id: trip.driver_id, email: trip.driver_email } : null,
          originDescription:      trip.origin_description,
          destinationDescription: trip.destination_description,
          unstartedFlag:   role === "super_admin" ? trip.unstarted_flag : null,
          createdAt:       trip.created_at,
          updatedAt:       trip.updated_at,
          fees: feesRes.rows.map((f) => ({
            id:            f.id,
            recipientType: f.recipient_type,
            recipientId:   f.recipient_id,
            feeType:       f.fee_type,
            amount:        f.amount,
            amountNaira:   (f.amount / 100).toFixed(2),
          })),
          events: eventsRes.rows.map((e) => ({
            id:          e.id,
            eventType:   e.event_type,
            performedBy: e.performed_by_email,
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
