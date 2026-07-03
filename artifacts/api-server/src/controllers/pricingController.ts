import { type Request, type Response } from "express";
import pool from "../db/connection.js";

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createPricingChart(req: Request, res: Response): Promise<void> {
  const userId = req.user?.userId ?? null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const chartRes = await client.query<{
      id: string; loading_fee: number; unloading_fee: number; is_active: boolean; created_at: string;
    }>(
      `INSERT INTO pricing_charts (loading_fee, unloading_fee, is_active, created_by)
       VALUES (0, 0, false, $1)
       RETURNING id, loading_fee, unloading_fee, is_active, created_at`,
      [userId],
    );
    const chart = chartRes.rows[0]!;

    await client.query("COMMIT");
    res.status(201).json({ data: { chart: { ...chart, vehicleTypeRates: [] } } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create pricing chart" });
  } finally {
    client.release();
  }
}

export async function updatePricingChart(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

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

    res.json({ data: { chart: existingRes.rows[0] } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update pricing chart" });
  } finally {
    client.release();
  }
}

export async function getActivePricingChart(_req: Request, res: Response): Promise<void> {
  try {
    const chartRes = await pool.query<{
      id: string; is_active: boolean; created_at: string;
    }>(
      `SELECT id, is_active, created_at FROM pricing_charts WHERE is_active = true LIMIT 1`,
    );

    if (chartRes.rows.length === 0) {
      res.json({ data: { chart: null } });
      return;
    }

    const chart = chartRes.rows[0]!;

    // Fetch all rates with vehicle type and stakeholder info
    const ratesRes = await pool.query<{
      vehicle_type_id:   string;
      vehicle_type_name: string;
      loading_fee:       number;
      unloading_fee:     number;
      vehicle_type_is_active: boolean;
      stakeholder_id:    string;
      stakeholder_name:  string;
      amount:            number;
    }>(
      `SELECT
         vt.id   AS vehicle_type_id,
         vt.name AS vehicle_type_name,
         vt.loading_fee,
         vt.unloading_fee,
         vt.is_active AS vehicle_type_is_active,
         s.id    AS stakeholder_id,
         s.name  AS stakeholder_name,
         pcsr.amount
       FROM pricing_chart_stakeholder_rates pcsr
       JOIN vehicle_types  vt ON vt.id = pcsr.vehicle_type_id
       JOIN stakeholders   s  ON s.id  = pcsr.stakeholder_id
       WHERE pcsr.pricing_chart_id = $1
         AND s.is_active = true
       ORDER BY vt.loading_fee ASC, s.name ASC`,
      [chart.id],
    );

    // Group rates by vehicle type
    const vehicleTypeMap = new Map<string, {
      vehicleTypeId:   string;
      vehicleTypeName: string;
      loadingFee:      number;
      unloadingFee:    number;
      isActive:        boolean;
      stakeholderRates: Array<{ stakeholderId: string; stakeholderName: string; amount: number }>;
    }>();

    for (const row of ratesRes.rows) {
      if (!vehicleTypeMap.has(row.vehicle_type_id)) {
        vehicleTypeMap.set(row.vehicle_type_id, {
          vehicleTypeId:   row.vehicle_type_id,
          vehicleTypeName: row.vehicle_type_name,
          loadingFee:      row.loading_fee,
          unloadingFee:    row.unloading_fee,
          isActive:        row.vehicle_type_is_active,
          stakeholderRates: [],
        });
      }
      vehicleTypeMap.get(row.vehicle_type_id)!.stakeholderRates.push({
        stakeholderId:   row.stakeholder_id,
        stakeholderName: row.stakeholder_name,
        amount:          row.amount,
      });
    }

    res.json({
      data: {
        chart: {
          id:               chart.id,
          isActive:         chart.is_active,
          createdAt:        chart.created_at,
          vehicleTypeRates: Array.from(vehicleTypeMap.values()),
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve active pricing chart" });
  }
}

export async function addStakeholderRate(req: Request, res: Response): Promise<void> {
  try {
    const { chartId } = req.params as { chartId: string };
    const { stakeholderId, vehicleTypeId, amount } = req.body as {
      stakeholderId?: unknown;
      vehicleTypeId?: unknown;
      amount?: unknown;
    };

    if (!stakeholderId || typeof stakeholderId !== "string" || !UUID_RE.test(stakeholderId)) {
      res.status(400).json({ error: "BAD_REQUEST", message: "stakeholderId is required and must be a valid UUID" });
      return;
    }
    if (!vehicleTypeId || typeof vehicleTypeId !== "string" || !UUID_RE.test(vehicleTypeId)) {
      res.status(400).json({ error: "BAD_REQUEST", message: "vehicleTypeId is required and must be a valid UUID" });
      return;
    }
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "amount must be a non-negative integer (kobo)" });
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

    const vtCheck = await pool.query<{ id: string }>(
      `SELECT id FROM vehicle_types WHERE id = $1`,
      [vehicleTypeId],
    );
    if (vtCheck.rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Vehicle type not found" });
      return;
    }

    const result = await pool.query<{ id: string; stakeholder_id: string; vehicle_type_id: string; amount: number }>(
      `INSERT INTO pricing_chart_stakeholder_rates (pricing_chart_id, stakeholder_id, vehicle_type_id, amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ON CONSTRAINT pricing_chart_stakeholder_rates_unique
       DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()
       RETURNING id, stakeholder_id, vehicle_type_id, amount`,
      [chartId, stakeholderId, vehicleTypeId, amount],
    );
    res.status(201).json({ data: { rate: result.rows[0] } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to add stakeholder rate" });
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

    await client.query("COMMIT");
    res.json({ data: { chart: chartRes.rows[0] } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to activate pricing chart" });
  } finally {
    client.release();
  }
}

export async function deleteStakeholderRate(req: Request, res: Response): Promise<void> {
  const { chartId, rateId } = req.params as { chartId: string; rateId: string };

  try {
    const result = await pool.query(
      `DELETE FROM pricing_chart_stakeholder_rates WHERE id = $1 AND pricing_chart_id = $2`,
      [rateId, chartId],
    );
    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Rate not found" });
      return;
    }
    res.json({ data: { id: rateId }, message: "Rate deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to delete rate" });
  }
}

export async function updateStakeholderRate(req: Request, res: Response): Promise<void> {
  try {
    const { chartId } = req.params as { chartId: string };
    const { stakeholderId, vehicleTypeId, amount } = req.body as {
      stakeholderId?: unknown;
      vehicleTypeId?: unknown;
      amount?: unknown;
    };

    if (!stakeholderId || typeof stakeholderId !== "string" || !UUID_RE.test(stakeholderId)) {
      res.status(400).json({ error: "BAD_REQUEST", message: "stakeholderId is required and must be a valid UUID" });
      return;
    }
    if (!vehicleTypeId || typeof vehicleTypeId !== "string" || !UUID_RE.test(vehicleTypeId)) {
      res.status(400).json({ error: "BAD_REQUEST", message: "vehicleTypeId is required and must be a valid UUID" });
      return;
    }
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "amount must be a non-negative integer (kobo)" });
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

    const result = await pool.query<{ id: string; stakeholder_id: string; vehicle_type_id: string; amount: number }>(
      `INSERT INTO pricing_chart_stakeholder_rates (pricing_chart_id, stakeholder_id, vehicle_type_id, amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ON CONSTRAINT pricing_chart_stakeholder_rates_unique
       DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()
       RETURNING id, stakeholder_id, vehicle_type_id, amount`,
      [chartId, stakeholderId, vehicleTypeId, amount],
    );

    res.json({
      data: { rate: result.rows[0] },
      message: "Stakeholder rate updated",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update stakeholder rate" });
  }
}

// Keep isPositiveInt exported for any future use
export { isPositiveInt };
