import { type Request, type Response } from "express";
import pool from "../db/connection.js";

interface StakeholderFeeInput {
  stakeholderId: string;
  amount: number;
  enabled: boolean;
}

interface FeesInput {
  loadingFee?: number;
  unloadingFee?: number;
  stakeholders?: StakeholderFeeInput[];
}

interface CreateTripBody {
  vehicleNumber?: string;
  driverId?: string;
  loadingStateId?: string;
  unloadingStateId?: string;
  originDescription?: string;
  destinationDescription?: string;
  fees?: FeesInput;
}

interface FeeEntry {
  recipientType: string;
  recipientId: string;
  feeType: string;
  amount: number;
}

export async function createTrip(req: Request, res: Response): Promise<void> {
  const {
    vehicleNumber,
    driverId,
    loadingStateId,
    unloadingStateId,
    originDescription,
    destinationDescription,
    fees,
  } = req.body as CreateTripBody;

  if (!vehicleNumber || !loadingStateId || !unloadingStateId) {
    res.status(400).json({
      error: "BAD_REQUEST",
      message: "vehicleNumber, loadingStateId, and unloadingStateId are required",
    });
    return;
  }

  const client = await pool.connect();

  try {
    // Check for duplicate active vehicle
    const { rows: activeTrips } = await client.query<{ id: string }>(
      `SELECT id FROM trips
       WHERE vehicle_number = $1
         AND status NOT IN ('delivered', 'cancelled')
         AND deleted_at IS NULL
       LIMIT 1`,
      [vehicleNumber]
    );

    if (activeTrips.length > 0) {
      res.status(400).json({
        error: "CONFLICT",
        message: "Vehicle already has an active trip",
      });
      return;
    }

    await client.query("BEGIN");

    const createdById = req.user!.userId;

    // Insert trip
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
        vehicleNumber,
        driverId ?? null,
        loadingStateId,
        unloadingStateId,
        originDescription ?? null,
        destinationDescription ?? null,
        createdById,
      ]
    );

    // Build fee entries
    const feeEntries: FeeEntry[] = [];
    const loadingAmount = fees?.loadingFee ?? 0;
    const unloadingAmount = fees?.unloadingFee ?? 0;
    const sameState = loadingStateId === unloadingStateId;

    if (sameState) {
      // Same state — single combined fee row to avoid double-crediting separate wallets
      const combined = loadingAmount + unloadingAmount;
      if (combined > 0) {
        feeEntries.push({
          recipientType: "state",
          recipientId: loadingStateId,
          feeType: "state_fee",
          amount: combined,
        });
      }
    } else {
      if (loadingAmount > 0) {
        feeEntries.push({
          recipientType: "state",
          recipientId: loadingStateId,
          feeType: "loading_fee",
          amount: loadingAmount,
        });
      }
      if (unloadingAmount > 0) {
        feeEntries.push({
          recipientType: "state",
          recipientId: unloadingStateId,
          feeType: "unloading_fee",
          amount: unloadingAmount,
        });
      }
    }

    // Enabled stakeholder fees only
    for (const sh of fees?.stakeholders ?? []) {
      if (sh.enabled && sh.amount > 0) {
        feeEntries.push({
          recipientType: "stakeholder",
          recipientId: sh.stakeholderId,
          feeType: "stakeholder_fee",
          amount: sh.amount,
        });
      }
    }

    // Insert each fee, update wallet, and record ledger entry
    const insertedFees: Array<{
      id: string;
      trip_id: string;
      recipient_type: string;
      recipient_id: string;
      fee_type: string;
      amount: number;
    }> = [];

    for (const entry of feeEntries) {
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

      insertedFees.push(fee);

      // Credit wallet balance
      await client.query(
        `UPDATE wallets
         SET total_collected = total_collected + $1, updated_at = now()
         WHERE owner_type = $2 AND owner_id = $3`,
        [entry.amount, entry.recipientType, entry.recipientId]
      );

      // Ledger entry
      await client.query(
        `INSERT INTO wallet_ledger (wallet_id, trip_id, trip_fee_id, amount, entry_type)
         SELECT w.id, $1, $2, $3, 'credit'
         FROM wallets w
         WHERE w.owner_type = $4 AND w.owner_id = $5`,
        [trip.id, fee.id, entry.amount, entry.recipientType, entry.recipientId]
      );
    }

    // Trip event
    await client.query(
      `INSERT INTO trip_events (trip_id, event_type, performed_by, metadata)
       VALUES ($1, 'created', $2, $3::jsonb)`,
      [trip.id, createdById, JSON.stringify({ vehicleNumber })]
    );

    await client.query("COMMIT");

    res.status(201).json({
      data: { trip, fees: insertedFees },
      message: "Trip created",
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create trip" });
  } finally {
    client.release();
  }
}
