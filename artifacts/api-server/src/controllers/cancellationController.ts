import { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../db/connection.js";

// ── Shared wallet reversal + cancel helper ───────────────────────────────────

interface LedgerEntry {
  id: string;
  wallet_id: string;
  trip_fee_id: string;
  amount: number;
}

async function applyWalletReversal(
  client: PoolClient,
  tripId: string,
  callerId: string,
  previousStatus: string
): Promise<{ reversedEntries: number; walletsRestored: number }> {
  const { rows: creditEntries } = await client.query<LedgerEntry>(
    `SELECT id, wallet_id, trip_fee_id, amount
     FROM wallet_ledger
     WHERE trip_id = $1 AND entry_type = 'credit'`,
    [tripId]
  );

  let reversedEntries = 0;
  let walletsRestored = 0;

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
       SET total_collected = total_collected - $1, updated_at = NOW()
       WHERE id = $2`,
      [entry.amount, entry.wallet_id]
    );
    if ((walletRes.rowCount ?? 0) !== 1) {
      throw new Error(`Wallet update failed for wallet ${entry.wallet_id}`);
    }
    walletsRestored += walletRes.rowCount ?? 0;
  }

  await client.query(
    `UPDATE trips
     SET status = 'cancelled', deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [tripId]
  );

  await client.query(
    `INSERT INTO trip_events (trip_id, event_type, performed_by, metadata)
     VALUES ($1, 'cancelled', $2, $3::jsonb)`,
    [tripId, callerId, JSON.stringify({ previousStatus, reversedEntries })]
  );

  return { reversedEntries, walletsRestored };
}

// ── requestCancellation ──────────────────────────────────────────────────────
// PATCH /api/trips/:tripId/request-cancellation  (trip_admin only)

export async function requestCancellation(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params as { tripId: string };
  const callerId = req.user!.userId;
  const { reason } = req.body as { reason?: unknown };

  if (!reason || typeof reason !== "string" || reason.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "reason is required" });
    return;
  }

  const client = await pool.connect();
  try {
    const { rows: tripRows } = await client.query<{
      id: string;
      status: string;
      created_by: string;
    }>(
      `SELECT id, status, created_by FROM trips WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [tripId]
    );

    if (tripRows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Trip not found" });
      return;
    }

    const trip = tripRows[0]!;

    if (
      trip.status === "completed" ||
      trip.status === "cancelled" ||
      trip.status === "cancellation_pending"
    ) {
      res.status(409).json({
        error: "CONFLICT",
        message: "Trip cannot be cancelled from its current status",
      });
      return;
    }

    if (trip.created_by !== callerId) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: "You can only request cancellation for trips you created",
      });
      return;
    }

    const { rows: userRows } = await client.query<{ can_cancel_without_approval: boolean }>(
      `SELECT can_cancel_without_approval FROM users WHERE id = $1 LIMIT 1`,
      [callerId]
    );
    const canCancelWithoutApproval = userRows[0]?.can_cancel_without_approval ?? false;

    const previousStatus = trip.status;

    if (canCancelWithoutApproval) {
      // Immediate cancellation path
      await client.query("BEGIN");
      const { reversedEntries, walletsRestored } = await applyWalletReversal(
        client,
        tripId,
        callerId,
        previousStatus
      );
      await client.query("COMMIT");

      res.status(200).json({
        data: {
          tripId,
          status: "cancelled",
          immediate: true,
          reversedEntries,
          walletsRestored,
        },
        message: "Trip cancelled immediately",
      });
    } else {
      // Pending approval path — lock the trip row first to prevent races
      await client.query("BEGIN");

      // BUG-03: Re-check trip status inside the transaction with a row lock.
      // Two concurrent requests may both pass the status check above; the FOR UPDATE
      // lock serialises them so only the first proceeds.
      const { rows: lockedTrip } = await client.query<{ status: string }>(
        `SELECT status FROM trips WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [tripId]
      );
      if (
        lockedTrip[0]?.status === "completed" ||
        lockedTrip[0]?.status === "cancelled" ||
        lockedTrip[0]?.status === "cancellation_pending"
      ) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "CONFLICT",
          message: "Trip cannot be cancelled from its current status",
        });
        return;
      }

      // Also guard against a pending CR that was inserted by a concurrent request
      const { rows: existingCR } = await client.query<{ id: string }>(
        `SELECT id FROM cancellation_requests WHERE trip_id = $1 AND status = 'pending' LIMIT 1`,
        [tripId]
      );
      if (existingCR.length > 0) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "CONFLICT",
          message: "A cancellation request for this trip is already pending.",
        });
        return;
      }

      const { rows: reqRows } = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO cancellation_requests
           (trip_id, requested_by, reason, status, previous_trip_status)
         VALUES ($1, $2, $3, 'pending', $4)
         RETURNING id, created_at`,
        [tripId, callerId, reason.trim(), previousStatus]
      );
      const cancellationRequest = reqRows[0]!;

      await client.query(
        `UPDATE trips SET status = 'cancellation_pending', updated_at = NOW() WHERE id = $1`,
        [tripId]
      );

      await client.query(
        `INSERT INTO trip_events (trip_id, event_type, performed_by, metadata)
         VALUES ($1, 'cancellation_requested', $2, $3::jsonb)`,
        [tripId, callerId, JSON.stringify({ reason: reason.trim() })]
      );

      await client.query("COMMIT");

      res.status(201).json({
        data: {
          id: cancellationRequest.id,
          tripId,
          status: "pending",
          previousTripStatus: previousStatus,
          createdAt: cancellationRequest.created_at,
        },
        message: "Cancellation request submitted",
      });
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to process cancellation request" });
  } finally {
    client.release();
  }
}

// ── listCancellationRequests ─────────────────────────────────────────────────
// GET /api/cancellation-requests  (state_admin only)

export async function listCancellationRequests(req: Request, res: Response): Promise<void> {
  const callerEntityId = req.user!.entityId;

  try {
    const { rows } = await pool.query<{
      id: string;
      trip_id: string;
      reason: string;
      status: string;
      previous_trip_status: string;
      created_at: Date;
      vehicle_number: string;
      driver_name: string | null;
      loading_state: string;
      unloading_state: string;
      requested_by_email: string;
    }>(
      `SELECT
         cr.id,
         cr.trip_id,
         cr.reason,
         cr.status,
         cr.previous_trip_status,
         cr.created_at,
         v.registration_number AS vehicle_number,
         d.full_name        AS driver_name,
         ls.name            AS loading_state,
         us2.name           AS unloading_state,
         u.email            AS requested_by_email
       FROM cancellation_requests cr
       JOIN trips   t   ON t.id  = cr.trip_id
       JOIN vehicles v  ON v.id  = t.vehicle_id
       JOIN users   u   ON u.id  = cr.requested_by
       LEFT JOIN drivers d ON d.id = t.driver_id
       JOIN states  ls  ON ls.id = t.loading_state_id
       JOIN states  us2 ON us2.id = t.unloading_state_id
       WHERE cr.status = 'pending'
         AND u.entity_id = $1
       ORDER BY cr.created_at DESC`,
      [callerEntityId]
    );

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        tripId: r.trip_id,
        reason: r.reason,
        status: r.status,
        previousTripStatus: r.previous_trip_status,
        createdAt: r.created_at,
        vehicleNumber: r.vehicle_number,
        driverName: r.driver_name,
        loadingState: r.loading_state,
        unloadingState: r.unloading_state,
        requestedByEmail: r.requested_by_email,
      })),
      message: "Cancellation requests retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch cancellation requests" });
  }
}

// ── approveCancellation ──────────────────────────────────────────────────────
// PATCH /api/cancellation-requests/:id/approve  (state_admin only)

export async function approveCancellation(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const callerId = req.user!.userId;
  const callerEntityId = req.user!.entityId;

  const client = await pool.connect();
  try {
    // BUG-02: Open the transaction first, then lock the CR row with FOR UPDATE.
    // This prevents two concurrent approvals from both passing the status check
    // and both executing the wallet reversal.
    await client.query("BEGIN");

    const { rows } = await client.query<{
      id: string;
      trip_id: string;
      status: string;
      previous_trip_status: string;
      requested_by_entity_id: string;
    }>(
      `SELECT
         cr.id,
         cr.trip_id,
         cr.status,
         cr.previous_trip_status,
         u.entity_id AS requested_by_entity_id
       FROM cancellation_requests cr
       JOIN users u ON u.id = cr.requested_by
       WHERE cr.id = $1
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "NOT_FOUND", message: "Cancellation request not found" });
      return;
    }

    const request = rows[0]!;

    if (request.status !== "pending") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "CONFLICT", message: "This request has already been reviewed" });
      return;
    }

    if (request.requested_by_entity_id !== callerEntityId) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "FORBIDDEN", message: "This request does not belong to your state" });
      return;
    }

    const { reversedEntries, walletsRestored } = await applyWalletReversal(
      client,
      request.trip_id,
      callerId,
      request.previous_trip_status
    );

    await client.query(
      `UPDATE cancellation_requests
       SET status = 'approved', reviewed_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [callerId, id]
    );

    await client.query("COMMIT");

    res.json({
      data: {
        id,
        tripId: request.trip_id,
        status: "approved",
        reversedEntries,
        walletsRestored,
      },
      message: "Cancellation approved and trip cancelled",
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to approve cancellation" });
  } finally {
    client.release();
  }
}

// ── rejectCancellation ───────────────────────────────────────────────────────
// PATCH /api/cancellation-requests/:id/reject  (state_admin only)

export async function rejectCancellation(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const callerId = req.user!.userId;
  const callerEntityId = req.user!.entityId;
  const { rejectionReason } = req.body as { rejectionReason?: unknown };

  if (!rejectionReason || typeof rejectionReason !== "string" || rejectionReason.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "rejectionReason is required" });
    return;
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      id: string;
      trip_id: string;
      status: string;
      previous_trip_status: string;
      requested_by_entity_id: string;
    }>(
      `SELECT
         cr.id,
         cr.trip_id,
         cr.status,
         cr.previous_trip_status,
         u.entity_id AS requested_by_entity_id
       FROM cancellation_requests cr
       JOIN users u ON u.id = cr.requested_by
       WHERE cr.id = $1 LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Cancellation request not found" });
      return;
    }

    const request = rows[0]!;

    if (request.status !== "pending") {
      res.status(409).json({ error: "CONFLICT", message: "This request has already been reviewed" });
      return;
    }

    if (request.requested_by_entity_id !== callerEntityId) {
      res.status(403).json({ error: "FORBIDDEN", message: "This request does not belong to your state" });
      return;
    }

    await client.query("BEGIN");

    await client.query(
      `UPDATE trips SET status = $1, updated_at = NOW() WHERE id = $2`,
      [request.previous_trip_status, request.trip_id]
    );

    await client.query(
      `UPDATE cancellation_requests
       SET status = 'rejected', reviewed_by = $1, rejection_reason = $2, updated_at = NOW()
       WHERE id = $3`,
      [callerId, rejectionReason.trim(), id]
    );

    await client.query(
      `INSERT INTO trip_events (trip_id, event_type, performed_by, metadata)
       VALUES ($1, 'cancellation_rejected', $2, $3::jsonb)`,
      [request.trip_id, callerId, JSON.stringify({ rejectionReason: rejectionReason.trim() })]
    );

    await client.query("COMMIT");

    res.json({
      data: {
        id,
        tripId: request.trip_id,
        status: "rejected",
        previousTripStatus: request.previous_trip_status,
      },
      message: "Cancellation request rejected",
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to reject cancellation" });
  } finally {
    client.release();
  }
}

// ── updateCancellationRights ─────────────────────────────────────────────────
// PATCH /api/users/:id/cancellation-rights  (state_admin only)

export async function updateCancellationRights(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const callerEntityId = req.user!.entityId;
  const { canCancelWithoutApproval } = req.body as { canCancelWithoutApproval?: unknown };

  if (typeof canCancelWithoutApproval !== "boolean") {
    res.status(400).json({ error: "BAD_REQUEST", message: "canCancelWithoutApproval must be a boolean" });
    return;
  }

  try {
    const { rows } = await pool.query<{
      id: string;
      email: string;
      role: string;
      entity_id: string | null;
    }>(
      `SELECT id, email, role, entity_id FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }

    const target = rows[0]!;

    if (target.role !== "trip_admin") {
      res.status(400).json({
        error: "BAD_REQUEST",
        message: "Only trip_admin users can have cancellation rights",
      });
      return;
    }

    if (target.entity_id !== callerEntityId) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: "This user does not belong to your state",
      });
      return;
    }

    await pool.query(
      `UPDATE users SET can_cancel_without_approval = $1, updated_at = NOW() WHERE id = $2`,
      [canCancelWithoutApproval, id]
    );

    res.json({
      data: {
        id,
        email: target.email,
        canCancelWithoutApproval,
      },
      message: `Cancellation rights ${canCancelWithoutApproval ? "granted" : "revoked"}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update cancellation rights" });
  }
}
