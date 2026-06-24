import { type Request, type Response } from "express";
import pool from "../db/connection.js";

interface StakeholderRateInput {
  stakeholder_id: string;
  amount: number;
}

interface PricingChartBody {
  loading_fee?: unknown;
  unloading_fee?: unknown;
  stakeholder_rates?: unknown;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function validateBody(
  body: PricingChartBody,
  res: Response,
): { loading_fee: number; unloading_fee: number; stakeholder_rates: StakeholderRateInput[] } | null {
  // loading_fee and unloading_fee are deprecated — per-state rates are now used for loading/unloading.
  // Accept positive int if provided; otherwise default to 0.
  let loading_fee = 0;
  let unloading_fee = 0;
  if (body.loading_fee !== undefined) {
    if (!isPositiveInt(body.loading_fee) && body.loading_fee !== 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "loading_fee must be a positive integer (kobo) if provided" });
      return null;
    }
    loading_fee = (body.loading_fee as number) || 0;
  }
  if (body.unloading_fee !== undefined) {
    if (!isPositiveInt(body.unloading_fee) && body.unloading_fee !== 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "unloading_fee must be a positive integer (kobo) if provided" });
      return null;
    }
    unloading_fee = (body.unloading_fee as number) || 0;
  }

  const stakeholder_rates = Array.isArray(body.stakeholder_rates) ? body.stakeholder_rates : [];
  for (const r of stakeholder_rates as StakeholderRateInput[]) {
    if (!r.stakeholder_id || typeof r.stakeholder_id !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "Each rate must have a valid stakeholder_id" });
      return null;
    }
    if (!isPositiveInt(r.amount)) {
      res.status(400).json({ error: "BAD_REQUEST", message: `Rate for stakeholder ${r.stakeholder_id} must be a positive integer (kobo)` });
      return null;
    }
  }
  return {
    loading_fee,
    unloading_fee,
    stakeholder_rates: stakeholder_rates as StakeholderRateInput[],
  };
}

export async function createPricingChart(req: Request, res: Response): Promise<void> {
  const validated = validateBody(req.body as PricingChartBody, res);
  if (!validated) return;

  const { loading_fee, unloading_fee, stakeholder_rates } = validated;
  const userId = (req as any).userId as string | undefined;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const chartRes = await client.query<{
      id: string; loading_fee: number; unloading_fee: number; is_active: boolean; created_at: string;
    }>(
      `INSERT INTO pricing_charts (loading_fee, unloading_fee, is_active, created_by)
       VALUES ($1, $2, false, $3)
       RETURNING id, loading_fee, unloading_fee, is_active, created_at`,
      [loading_fee, unloading_fee, userId ?? null],
    );
    const chart = chartRes.rows[0]!;
    const rates: { id: string; stakeholder_id: string; amount: number }[] = [];

    for (const r of stakeholder_rates) {
      const rateRes = await client.query<{ id: string; stakeholder_id: string; amount: number }>(
        `INSERT INTO pricing_chart_stakeholder_rates (pricing_chart_id, stakeholder_id, amount)
         VALUES ($1, $2, $3)
         RETURNING id, stakeholder_id, amount`,
        [chart.id, r.stakeholder_id, r.amount],
      );
      rates.push(rateRes.rows[0]!);
    }

    await client.query("COMMIT");
    res.status(201).json({ data: { chart: { ...chart, stakeholder_rates: rates } } });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updatePricingChart(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const validated = validateBody(req.body as PricingChartBody, res);
  if (!validated) return;

  const { loading_fee, unloading_fee, stakeholder_rates } = validated;

  const client = await pool.connect();
  try {
    const existingRes = await client.query<{ id: string; is_active: boolean }>(
      `SELECT id, is_active FROM pricing_charts WHERE id = $1`,
      [id],
    );
    if (existingRes.rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Pricing chart not found" });
      return;
    }
    if (existingRes.rows[0]!.is_active) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Cannot update an active pricing chart" });
      return;
    }

    await client.query("BEGIN");

    const chartRes = await client.query<{
      id: string; loading_fee: number; unloading_fee: number; is_active: boolean; created_at: string;
    }>(
      `UPDATE pricing_charts
       SET loading_fee = $1, unloading_fee = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, loading_fee, unloading_fee, is_active, created_at`,
      [loading_fee, unloading_fee, id],
    );

    for (const r of stakeholder_rates) {
      await client.query(
        `INSERT INTO pricing_chart_stakeholder_rates (pricing_chart_id, stakeholder_id, amount)
         VALUES ($1, $2, $3)
         ON CONFLICT (pricing_chart_id, stakeholder_id)
         DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()`,
        [id, r.stakeholder_id, r.amount],
      );
    }

    const ratesRes = await client.query<{ id: string; stakeholder_id: string; amount: number }>(
      `SELECT id, stakeholder_id, amount FROM pricing_chart_stakeholder_rates WHERE pricing_chart_id = $1`,
      [id],
    );

    await client.query("COMMIT");
    res.json({ data: { chart: { ...chartRes.rows[0], stakeholder_rates: ratesRes.rows } } });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getActivePricingChart(_req: Request, res: Response): Promise<void> {
  const chartRes = await pool.query<{
    id: string; loading_fee: number; unloading_fee: number; is_active: boolean; created_at: string;
  }>(
    `SELECT id, loading_fee, unloading_fee, is_active, created_at
     FROM pricing_charts WHERE is_active = true LIMIT 1`,
  );

  if (chartRes.rows.length === 0) {
    res.json({ data: { chart: null, unassignedStakeholders: [] } });
    return;
  }

  const chart = chartRes.rows[0]!;

  const ratesRes = await pool.query<{
    id: string; stakeholder_id: string; amount: number; stakeholder_name: string;
  }>(
    `SELECT r.id, r.stakeholder_id, r.amount, s.name AS stakeholder_name
     FROM pricing_chart_stakeholder_rates r
     JOIN stakeholders s ON s.id = r.stakeholder_id
     WHERE r.pricing_chart_id = $1`,
    [chart.id],
  );

  const unassignedRes = await pool.query<{ id: string; name: string }>(
    `SELECT s.id, s.name
     FROM stakeholders s
     WHERE s.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM pricing_chart_stakeholder_rates r
         WHERE r.pricing_chart_id = $1 AND r.stakeholder_id = s.id
       )
     ORDER BY s.name ASC`,
    [chart.id],
  );

  res.json({
    data: {
      chart: {
        ...chart,
        stakeholder_rates: ratesRes.rows,
        unassignedStakeholders: unassignedRes.rows,
      },
    },
  });
}

export async function addStakeholderRate(req: Request, res: Response): Promise<void> {
  try {
    const { chartId } = req.params as { chartId: string };
    const { stakeholderId, amount } = req.body as { stakeholderId?: unknown; amount?: unknown };

    if (!stakeholderId || typeof stakeholderId !== "string") {
      res.status(400).json({ error: "BAD_REQUEST", message: "stakeholderId is required" });
      return;
    }
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "amount must be a positive integer (kobo)" });
      return;
    }

    const chartCheck = await pool.query<{ id: string }>(
      `SELECT id FROM pricing_charts WHERE id = $1`,
      [chartId],
    );
    if (chartCheck.rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Pricing chart not found" });
      return;
    }

    const shCheck = await pool.query<{ id: string }>(
      `SELECT id FROM stakeholders WHERE id = $1`,
      [stakeholderId],
    );
    if (shCheck.rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Stakeholder not found" });
      return;
    }

    const result = await pool.query<{ id: string; stakeholder_id: string; amount: number }>(
      `INSERT INTO pricing_chart_stakeholder_rates (pricing_chart_id, stakeholder_id, amount)
       VALUES ($1, $2, $3)
       RETURNING id, stakeholder_id, amount`,
      [chartId, stakeholderId, amount],
    );
    res.status(201).json({ data: { rate: result.rows[0] } });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "CONFLICT", message: "Stakeholder already has a rate on this chart" });
      return;
    }
    throw err;
  }
}

export async function activatePricingChart(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    const existingRes = await client.query<{ id: string }>(
      `SELECT id FROM pricing_charts WHERE id = $1`,
      [id],
    );
    if (existingRes.rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Pricing chart not found" });
      return;
    }

    await client.query("BEGIN");
    await client.query(`UPDATE pricing_charts SET is_active = false, updated_at = NOW()`);
    const chartRes = await client.query<{
      id: string; loading_fee: number; unloading_fee: number; is_active: boolean; created_at: string;
    }>(
      `UPDATE pricing_charts SET is_active = true, updated_at = NOW()
       WHERE id = $1
       RETURNING id, loading_fee, unloading_fee, is_active, created_at`,
      [id],
    );

    const ratesRes = await client.query<{
      id: string; stakeholder_id: string; amount: number; stakeholder_name: string;
    }>(
      `SELECT r.id, r.stakeholder_id, r.amount, s.name AS stakeholder_name
       FROM pricing_chart_stakeholder_rates r
       JOIN stakeholders s ON s.id = r.stakeholder_id
       WHERE r.pricing_chart_id = $1`,
      [id],
    );

    await client.query("COMMIT");
    res.json({ data: { chart: { ...chartRes.rows[0], stakeholder_rates: ratesRes.rows } } });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
