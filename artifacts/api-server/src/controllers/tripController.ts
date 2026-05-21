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
