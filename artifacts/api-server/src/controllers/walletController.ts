import { type Request, type Response } from "express";
import pool from "../db/connection.js";

function toNaira(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

export async function getMyWallet(req: Request, res: Response): Promise<void> {
  const { entityType, entityId } = req.user!;

  if (!entityType || !entityId) {
    res.status(403).json({ error: "FORBIDDEN", message: "No wallet entity associated with this account" });
    return;
  }

  try {
    const { rows } = await pool.query<{
      id: string;
      owner_type: string;
      owner_id: string;
      total_collected: number;
    }>(
      `SELECT id, owner_type, owner_id, total_collected
       FROM wallets
       WHERE owner_type = $1 AND owner_id = $2
       LIMIT 1`,
      [entityType, entityId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Wallet not found" });
      return;
    }

    const w = rows[0]!;
    res.json({
      data: {
        wallet: {
          id: w.id,
          ownerType: w.owner_type,
          ownerId: w.owner_id,
          totalCollected: w.total_collected,
          totalCollectedNaira: toNaira(w.total_collected),
        },
      },
      message: "Wallet retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve wallet" });
  }
}

export async function getMyLedger(req: Request, res: Response): Promise<void> {
  const { entityType, entityId } = req.user!;

  if (!entityType || !entityId) {
    res.status(403).json({ error: "FORBIDDEN", message: "No wallet entity associated with this account" });
    return;
  }

  const { startDate, endDate, feeType, search, entryType } = req.query as Record<string, string | undefined>;
  const rawPage  = parseInt((req.query.page  as string) ?? "1",  10);
  const rawLimit = parseInt((req.query.limit as string) ?? "20", 10);
  const page  = Number.isFinite(rawPage)  && rawPage  > 0 ? rawPage  : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
  const offset = (page - 1) * limit;

  const validFeeTypes = ["loading", "unloading", "stakeholder_fee"];
  if (feeType && !validFeeTypes.includes(feeType)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "feeType must be loading, unloading, or stakeholder_fee" });
    return;
  }

  const validEntryTypes = ["credit", "reversal"];
  if (entryType && !validEntryTypes.includes(entryType)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "entryType must be credit or reversal" });
    return;
  }

  try {
    const walletRes = await pool.query<{ id: string }>(
      `SELECT id FROM wallets WHERE owner_type = $1 AND owner_id = $2 LIMIT 1`,
      [entityType, entityId]
    );
    if (walletRes.rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Wallet not found" });
      return;
    }
    const walletId = walletRes.rows[0]!.id;

    const params: unknown[] = [walletId];
    let paramIdx = 2;
    const filters: string[] = [];

    if (startDate) {
      params.push(startDate);
      filters.push(`wl.created_at >= $${paramIdx++}::timestamptz`);
    }
    if (endDate) {
      params.push(endDate);
      filters.push(`wl.created_at < ($${paramIdx++}::date + INTERVAL '1 day')`);
    }
    if (feeType) {
      params.push(feeType);
      filters.push(`tf.fee_type = $${paramIdx++}`);
    }
    if (entryType) {
      params.push(entryType);
      filters.push(`wl.entry_type = $${paramIdx++}`);
    }
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(v.registration_number ILIKE $${paramIdx} OR sl.name ILIKE $${paramIdx} OR su.name ILIKE $${paramIdx})`);
      paramIdx++;
    }

    const whereClause = filters.length > 0 ? `AND ${filters.join(" AND ")}` : "";

    const baseQuery = `
      FROM wallet_ledger wl
      JOIN trip_fees tf   ON wl.trip_fee_id    = tf.id
      JOIN trips t        ON wl.trip_id        = t.id
      JOIN vehicles v     ON t.vehicle_id      = v.id
      LEFT JOIN vehicle_types vt ON vt.id      = v.vehicle_type_id
      LEFT JOIN states sl ON sl.id             = t.loading_state_id
      LEFT JOIN states su ON su.id             = t.unloading_state_id
      WHERE wl.wallet_id = $1 ${whereClause}`;

    const [summaryRes, countRes] = await Promise.all([
      pool.query<{ total_credits: string; total_reversals: string }>(
        `SELECT
           COALESCE(SUM(CASE WHEN wl.entry_type = 'credit'   THEN wl.amount ELSE 0 END), 0) AS total_credits,
           COALESCE(SUM(CASE WHEN wl.entry_type = 'reversal' THEN wl.amount ELSE 0 END), 0) AS total_reversals
         ${baseQuery}`,
        params
      ),
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total ${baseQuery}`,
        params
      ),
    ]);

    const total      = parseInt(countRes.rows[0]!.total, 10);
    const totalPages = Math.ceil(total / limit);

    const entriesRes = await pool.query<{
      ledger_id:            string;
      trip_id:              string;
      vehicle_number:       string;
      vehicle_type_name:    string | null;
      fee_type:             string;
      amount:               number;
      entry_type:           string;
      cleared:              boolean;
      cleared_at:           Date | null;
      created_at:           Date;
      loading_state_name:   string;
      unloading_state_name: string;
    }>(
      `SELECT
         wl.id          AS ledger_id,
         wl.trip_id,
         v.registration_number AS vehicle_number,
         vt.name               AS vehicle_type_name,
         tf.fee_type,
         wl.amount,
         wl.entry_type,
         wl.cleared,
         wl.cleared_at,
         wl.created_at,
         COALESCE(sl.name, 'Unknown') AS loading_state_name,
         COALESCE(su.name, 'Unknown') AS unloading_state_name
       ${baseQuery}
       ORDER BY wl.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    // Fetch all trip_fees for every trip on this page (for the detail breakdown)
    const tripIds = [...new Set(entriesRes.rows.map((r) => r.trip_id))];

    let tripFeesMap: Map<string, Array<{
      id: string;
      feeType: string;
      recipientType: string;
      recipientId: string;
      recipientName: string | null;
      amount: number;
    }>> = new Map();

    if (tripIds.length > 0) {
      const allFeesRes = await pool.query<{
        trip_id:        string;
        id:             string;
        fee_type:       string;
        recipient_type: string;
        recipient_id:   string;
        recipient_name: string | null;
        amount:         number;
      }>(
        `SELECT
           tf.trip_id,
           tf.id,
           tf.fee_type,
           tf.recipient_type,
           tf.recipient_id,
           COALESCE(s.name, sh.name) AS recipient_name,
           tf.amount
         FROM trip_fees tf
         LEFT JOIN states       s  ON tf.recipient_type = 'state'       AND s.id  = tf.recipient_id
         LEFT JOIN stakeholders sh ON tf.recipient_type = 'stakeholder' AND sh.id = tf.recipient_id
         WHERE tf.trip_id = ANY($1::uuid[])
         ORDER BY tf.fee_type`,
        [tripIds]
      );

      for (const fee of allFeesRes.rows) {
        if (!tripFeesMap.has(fee.trip_id)) {
          tripFeesMap.set(fee.trip_id, []);
        }
        tripFeesMap.get(fee.trip_id)!.push({
          id:            fee.id,
          feeType:       fee.fee_type,
          recipientType: fee.recipient_type,
          recipientId:   fee.recipient_id,
          recipientName: fee.recipient_name,
          amount:        fee.amount,
        });
      }
    }

    const totalCredits   = parseInt(summaryRes.rows[0]!.total_credits,   10);
    const totalReversals = parseInt(summaryRes.rows[0]!.total_reversals, 10);

    res.json({
      data: {
        entries: entriesRes.rows.map((r) => ({
          ledgerId:            r.ledger_id,
          tripId:              r.trip_id,
          vehicleNumber:       r.vehicle_number,
          vehicleTypeName:     r.vehicle_type_name,
          feeType:             r.fee_type,
          amount:              r.amount,
          amountNaira:         toNaira(r.amount),
          entryType:           r.entry_type,
          cleared:             r.cleared,
          clearedAt:           r.cleared_at,
          createdAt:           r.created_at,
          loadingStateName:    r.loading_state_name,
          unloadingStateName:  r.unloading_state_name,
          tripFees:            tripFeesMap.get(r.trip_id) ?? [],
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        summary: {
          totalCredits,
          totalReversals,
          netTotal: totalCredits - totalReversals,
        },
      },
      message: "Ledger retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve ledger" });
  }
}

export async function getAllWallets(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id:                  string;
      owner_type:          string;
      owner_id:            string;
      owner_name:          string;
      total_collected:     number;
      is_clearing_enabled: boolean;
      owner_is_active:     boolean;
    }>(
      `SELECT
         w.id,
         w.owner_type,
         w.owner_id,
         COALESCE(s.name, sh.name) AS owner_name,
         w.total_collected,
         w.is_clearing_enabled,
         COALESCE(sh.is_active, true) AS owner_is_active
       FROM wallets w
       LEFT JOIN states       s  ON w.owner_type = 'state'       AND w.owner_id = s.id
       LEFT JOIN stakeholders sh ON w.owner_type = 'stakeholder' AND w.owner_id = sh.id
       ORDER BY w.owner_type ASC, COALESCE(s.name, sh.name) ASC`
    );

    const totalStates       = rows.filter((r) => r.owner_type === "state").length;
    const totalStakeholders = rows.filter((r) => r.owner_type === "stakeholder").length;
    const grandTotal        = rows.reduce((sum, r) => sum + r.total_collected, 0);

    res.json({
      data: {
        wallets: rows.map((r) => ({
          id:                  r.id,
          ownerType:           r.owner_type,
          ownerId:             r.owner_id,
          ownerName:           r.owner_name,
          totalCollected:      r.total_collected,
          totalCollectedNaira: toNaira(r.total_collected),
          isClearingEnabled:   r.is_clearing_enabled,
          ownerIsActive:       r.owner_is_active,
        })),
        summary: {
          totalStates,
          totalStakeholders,
          grandTotal,
          grandTotalNaira: toNaira(grandTotal),
        },
      },
      message: "All wallets retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve wallets" });
  }
}

export async function toggleClearingEnabled(req: Request, res: Response): Promise<void> {
  const { walletId } = req.params as { walletId: string };
  const { isEnabled } = req.body as { isEnabled?: unknown };

  if (typeof isEnabled !== "boolean") {
    res.status(400).json({ error: "BAD_REQUEST", message: "isEnabled must be a boolean" });
    return;
  }

  try {
    const { rows } = await pool.query<{
      id:                  string;
      owner_type:          string;
      owner_id:            string;
      total_collected:     number;
      is_clearing_enabled: boolean;
    }>(
      `UPDATE wallets
       SET is_clearing_enabled = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, owner_type, owner_id, total_collected, is_clearing_enabled`,
      [isEnabled, walletId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Wallet not found" });
      return;
    }

    const w = rows[0]!;
    res.json({
      data: {
        wallet: {
          id:                  w.id,
          ownerType:           w.owner_type,
          ownerId:             w.owner_id,
          totalCollected:      w.total_collected,
          totalCollectedNaira: toNaira(w.total_collected),
          isClearingEnabled:   w.is_clearing_enabled,
        },
      },
      message: isEnabled
        ? "Clearing enabled for this wallet"
        : "Clearing disabled for this wallet",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update clearing status" });
  }
}
