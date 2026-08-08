import { type Request, type Response } from "express";
import pool from "../db/connection.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ShareInput {
  recipientType: unknown;
  recipientId: unknown;
  percentage: unknown;
}

interface ValidatedShare {
  recipientType: "state" | "stakeholder";
  recipientId: string;
  percentage: number;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function isValidDateString(v: unknown): v is string {
  if (typeof v !== "string" || v.trim() === "") return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
}

/**
 * Allocate `totalKobo` across shares proportional to `percentages` (in the
 * same order) such that every allocated amount is a non-negative integer and
 * the amounts sum to EXACTLY `totalKobo` — using the largest-remainder
 * method. Independently rounding each share (Math.round) can leave the sum
 * off by a few kobo for many valid percentage splits; this guarantees an
 * exact reconciliation instead.
 */
function allocateKoboByLargestRemainder(totalKobo: number, percentages: number[]): number[] {
  const raw = percentages.map((p) => (p / 100) * totalKobo);
  const base = raw.map((v) => Math.floor(v));
  const remainders = raw.map((v, i) => ({ i, frac: v - base[i]! }));
  let distributed = base.reduce((sum, v) => sum + v, 0);
  let leftover = totalKobo - distributed;

  // Largest fractional remainder gets the extra kobo first; stable order
  // (index) breaks ties deterministically.
  remainders.sort((a, b) => b.frac - a.frac || a.i - b.i);

  const amounts = [...base];
  for (let k = 0; k < remainders.length && leftover > 0; k++, leftover--) {
    amounts[remainders[k]!.i]! += 1;
  }
  return amounts;
}

// ── createBulkPayment ─────────────────────────────────────────────────────

export async function createBulkPayment(req: Request, res: Response): Promise<void> {
  const { companyName, totalAmount, expiryDate, shares } = req.body as {
    companyName?: unknown;
    totalAmount?: unknown;
    expiryDate?: unknown;
    shares?: unknown;
  };

  if (!isNonEmptyString(companyName)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "companyName is required" });
    return;
  }
  if (!isPositiveNumber(totalAmount)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "totalAmount must be a positive number (Naira)" });
    return;
  }
  if (!isValidDateString(expiryDate)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "expiryDate must be a valid date" });
    return;
  }
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (new Date(expiryDate).getTime() < startOfToday.getTime()) {
    res.status(400).json({ error: "BAD_REQUEST", message: "expiryDate cannot be in the past" });
    return;
  }
  if (!Array.isArray(shares) || shares.length === 0) {
    res.status(400).json({ error: "BAD_REQUEST", message: "shares must be a non-empty array" });
    return;
  }

  const validatedShares: ValidatedShare[] = [];
  for (const raw of shares as ShareInput[]) {
    const { recipientType, recipientId, percentage } = raw ?? {};
    if (recipientType !== "state" && recipientType !== "stakeholder") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Each share's recipientType must be 'state' or 'stakeholder'" });
      return;
    }
    if (!isNonEmptyString(recipientId) || !UUID_RE.test(recipientId)) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Each share's recipientId must be a valid UUID" });
      return;
    }
    if (!isPositiveNumber(percentage)) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Each share's percentage must be a positive number" });
      return;
    }
    validatedShares.push({ recipientType, recipientId, percentage });
  }

  // Sum percentages using integer basis-points (percentage * 100) to avoid float drift,
  // matching the NUMERIC(5,2) precision the column is stored with.
  const totalBasisPoints = validatedShares.reduce(
    (sum, s) => sum + Math.round(s.percentage * 100),
    0
  );
  if (totalBasisPoints !== 10000) {
    res.status(400).json({
      error: "BAD_REQUEST",
      message: `The percentages must sum to exactly 100.00 (currently ${(totalBasisPoints / 100).toFixed(2)})`,
    });
    return;
  }

  // totalAmount arrives in Naira from the client; convert to whole kobo and
  // reject anything that doesn't represent an exact, sane, positive kobo
  // amount (sub-kobo fractions, unsafe/absurdly large numbers).
  const MAX_TOTAL_AMOUNT_KOBO = 100_000_000_000; // ₦1,000,000,000.00 ceiling
  const totalAmountKobo = Math.round(totalAmount * 100);
  if (!Number.isSafeInteger(totalAmountKobo) || totalAmountKobo < 1) {
    res.status(400).json({ error: "BAD_REQUEST", message: "totalAmount must be at least ₦0.01" });
    return;
  }
  if (Math.abs(totalAmount * 100 - totalAmountKobo) > 1e-6) {
    res.status(400).json({ error: "BAD_REQUEST", message: "totalAmount must not have more than 2 decimal places" });
    return;
  }
  if (totalAmountKobo > MAX_TOTAL_AMOUNT_KOBO) {
    res.status(400).json({ error: "BAD_REQUEST", message: "totalAmount exceeds the maximum allowed amount" });
    return;
  }

  const client = await pool.connect();
  try {
    // ── Validate every recipient exists (and, for stakeholders, is active) ──
    for (const share of validatedShares) {
      if (share.recipientType === "state") {
        const { rows } = await client.query<{ id: string }>(
          `SELECT id FROM states WHERE id = $1 LIMIT 1`,
          [share.recipientId]
        );
        if (rows.length === 0) {
          res.status(400).json({ error: "BAD_REQUEST", message: `recipientId ${share.recipientId} does not reference an existing state` });
          return;
        }
      } else {
        const { rows } = await client.query<{ id: string; is_active: boolean | null }>(
          `SELECT id, is_active FROM stakeholders WHERE id = $1 LIMIT 1`,
          [share.recipientId]
        );
        if (rows.length === 0) {
          res.status(400).json({ error: "BAD_REQUEST", message: `recipientId ${share.recipientId} does not reference an existing stakeholder` });
          return;
        }
        if (rows[0]!.is_active === false) {
          res.status(400).json({ error: "BAD_REQUEST", message: `Stakeholder ${share.recipientId} is not currently active` });
          return;
        }
      }
    }

    await client.query("BEGIN");

    const createdById = req.user!.userId;

    const { rows: [bulkPayment] } = await client.query<{
      id: string;
      company_name: string;
      total_amount: number;
      expiry_date: Date;
      created_by: string | null;
      status: string;
      archived: boolean;
      created_at: Date;
      reversal_deadline: Date;
    }>(
      `INSERT INTO bulk_payments (company_name, total_amount, expiry_date, created_by, reversal_deadline)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '2 hours')
       RETURNING *`,
      [companyName.trim(), totalAmountKobo, expiryDate, createdById]
    );

    const shareResults: Array<{
      id: string;
      recipientType: "state" | "stakeholder";
      recipientId: string;
      recipientName: string;
      percentage: number;
      amount: number;
    }> = [];

    const allocatedAmounts = allocateKoboByLargestRemainder(
      totalAmountKobo,
      validatedShares.map((s) => s.percentage)
    );

    for (let shareIdx = 0; shareIdx < validatedShares.length; shareIdx++) {
      const share = validatedShares[shareIdx]!;
      const amount = allocatedAmounts[shareIdx]!;

      const { rows: [shareRow] } = await client.query<{
        id: string;
        recipient_type: string;
        recipient_id: string;
        percentage: string;
        amount: number;
      }>(
        `INSERT INTO bulk_payment_shares (bulk_payment_id, recipient_type, recipient_id, percentage, amount)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [bulkPayment!.id, share.recipientType, share.recipientId, share.percentage, amount]
      );

      const nameRes = await client.query<{ name: string }>(
        share.recipientType === "state"
          ? `SELECT name FROM states WHERE id = $1`
          : `SELECT name FROM stakeholders WHERE id = $1`,
        [share.recipientId]
      );
      const recipientName = nameRes.rows[0]?.name ?? "Unknown";

      // Credit the recipient's wallet
      const walletUpdate = await client.query(
        `UPDATE wallets
         SET total_collected = total_collected + $1, updated_at = NOW()
         WHERE owner_type = $2 AND owner_id = $3`,
        [amount, share.recipientType, share.recipientId]
      );
      if ((walletUpdate.rowCount ?? 0) !== 1) {
        throw new Error(`Wallet not found for ${share.recipientType} ${share.recipientId} — cannot credit bulk payment share`);
      }

      // Ledger entry, traceable back to this bulk payment (no trip involved)
      const ledgerInsert = await client.query(
        `INSERT INTO wallet_ledger
           (wallet_id, trip_id, trip_fee_id, amount, entry_type, cleared, bulk_payment_id)
         SELECT w.id, NULL, NULL, $1, 'credit', false, $2
         FROM wallets w
         WHERE w.owner_type = $3 AND w.owner_id = $4`,
        [amount, bulkPayment!.id, share.recipientType, share.recipientId]
      );
      if ((ledgerInsert.rowCount ?? 0) !== 1) {
        throw new Error(`Ledger insert failed for ${share.recipientType} ${share.recipientId}`);
      }

      shareResults.push({
        id: shareRow!.id,
        recipientType: share.recipientType,
        recipientId: share.recipientId,
        recipientName,
        percentage: Number(shareRow!.percentage),
        amount: shareRow!.amount,
      });
    }

    await client.query("COMMIT");

    res.status(201).json({
      data: {
        bulkPayment: {
          id: bulkPayment!.id,
          companyName: bulkPayment!.company_name,
          totalAmount: bulkPayment!.total_amount,
          expiryDate: bulkPayment!.expiry_date,
          status: bulkPayment!.status,
          archived: bulkPayment!.archived,
          createdAt: bulkPayment!.created_at,
          reversalDeadline: bulkPayment!.reversal_deadline,
          shares: shareResults,
        },
      },
      message: "Bulk payment created",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create bulk payment" });
  } finally {
    client.release();
  }
}

// ── listBulkPayments ──────────────────────────────────────────────────────

export async function listBulkPayments(_req: Request, res: Response): Promise<void> {
  try {
    const { rows: paymentRows } = await pool.query<{
      id: string;
      company_name: string;
      total_amount: number;
      expiry_date: Date;
      status: string;
      archived: boolean;
      created_at: Date;
      reversal_deadline: Date;
    }>(
      `SELECT id, company_name, total_amount, expiry_date, status, archived, created_at, reversal_deadline
       FROM bulk_payments
       WHERE archived = false
       ORDER BY created_at DESC`
    );

    const paymentIds = paymentRows.map((p) => p.id);
    const sharesByPayment = new Map<string, Array<{
      id: string;
      recipientType: string;
      recipientId: string;
      recipientName: string;
      percentage: number;
      amount: number;
    }>>();

    if (paymentIds.length > 0) {
      const { rows: shareRows } = await pool.query<{
        bulk_payment_id: string;
        id: string;
        recipient_type: string;
        recipient_id: string;
        recipient_name: string | null;
        percentage: string;
        amount: number;
      }>(
        `SELECT
           bps.bulk_payment_id,
           bps.id,
           bps.recipient_type,
           bps.recipient_id,
           COALESCE(s.name, sh.name) AS recipient_name,
           bps.percentage,
           bps.amount
         FROM bulk_payment_shares bps
         LEFT JOIN states       s  ON bps.recipient_type = 'state'       AND s.id  = bps.recipient_id
         LEFT JOIN stakeholders sh ON bps.recipient_type = 'stakeholder' AND sh.id = bps.recipient_id
         WHERE bps.bulk_payment_id = ANY($1::uuid[])`,
        [paymentIds]
      );

      for (const s of shareRows) {
        if (!sharesByPayment.has(s.bulk_payment_id)) {
          sharesByPayment.set(s.bulk_payment_id, []);
        }
        sharesByPayment.get(s.bulk_payment_id)!.push({
          id: s.id,
          recipientType: s.recipient_type,
          recipientId: s.recipient_id,
          recipientName: s.recipient_name ?? "Unknown",
          percentage: Number(s.percentage),
          amount: s.amount,
        });
      }
    }

    const now = Date.now();

    res.json({
      data: {
        bulkPayments: paymentRows.map((p) => ({
          id: p.id,
          companyName: p.company_name,
          totalAmount: p.total_amount,
          expiryDate: p.expiry_date,
          status: p.status,
          archived: p.archived,
          createdAt: p.created_at,
          reversalDeadline: p.reversal_deadline,
          withinReversalWindow: p.status === "active" && new Date(p.reversal_deadline).getTime() > now,
          expired: new Date(p.expiry_date).getTime() < now,
          shares: sharesByPayment.get(p.id) ?? [],
        })),
      },
      message: "Bulk payments retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve bulk payments" });
  }
}

// ── reverseBulkPayment ────────────────────────────────────────────────────

export async function reverseBulkPayment(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the row first so concurrent reversal requests for the same bulk
    // payment serialize instead of both observing status='active'.
    const { rows } = await client.query<{
      id: string;
      status: string;
      reversal_deadline: Date;
    }>(
      `SELECT id, status, reversal_deadline FROM bulk_payments WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [id]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "NOT_FOUND", message: "Bulk payment not found" });
      return;
    }

    const bulkPayment = rows[0]!;
    if (bulkPayment.status !== "active" || new Date(bulkPayment.reversal_deadline).getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error: "CONFLICT",
        message: "This bulk payment is no longer eligible for reversal — it has already been reversed or its 2-hour reversal window has passed.",
      });
      return;
    }

    const { rows: creditEntries } = await client.query<{
      wallet_id: string;
      amount: number;
    }>(
      `SELECT wallet_id, amount FROM wallet_ledger WHERE bulk_payment_id = $1 AND entry_type = 'credit'`,
      [id]
    );

    for (const entry of creditEntries) {
      await client.query(
        `INSERT INTO wallet_ledger
           (wallet_id, trip_id, trip_fee_id, amount, entry_type, cleared, bulk_payment_id)
         VALUES ($1, NULL, NULL, $2, 'reversal', false, $3)`,
        [entry.wallet_id, -entry.amount, id]
      );

      const walletUpdate = await client.query(
        `UPDATE wallets
         SET total_collected = total_collected - $1, updated_at = NOW()
         WHERE id = $2`,
        [entry.amount, entry.wallet_id]
      );
      if ((walletUpdate.rowCount ?? 0) !== 1) {
        throw new Error(`Wallet update failed for wallet ${entry.wallet_id}`);
      }
    }

    const { rows: [updated] } = await client.query<{
      id: string;
      status: string;
    }>(
      `UPDATE bulk_payments SET status = 'reversed' WHERE id = $1 RETURNING id, status`,
      [id]
    );

    await client.query("COMMIT");

    res.json({
      data: {
        bulkPayment: {
          id: updated!.id,
          status: updated!.status,
        },
        reversedEntries: creditEntries.length,
      },
      message: "Bulk payment reversed",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to reverse bulk payment" });
  } finally {
    client.release();
  }
}

// ── removeBulkPayment (pure archive; never touches wallets/ledger) ───────

export async function removeBulkPayment(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };

  try {
    const { rows } = await pool.query<{ id: string; archived: boolean }>(
      `UPDATE bulk_payments SET archived = true WHERE id = $1 RETURNING id, archived`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Bulk payment not found" });
      return;
    }

    res.json({
      data: { bulkPayment: { id: rows[0]!.id, archived: rows[0]!.archived } },
      message: "Bulk payment removed from list",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to remove bulk payment" });
  }
}
