import { type Request, type Response } from "express";
import pool from "../db/connection.js";

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

export async function listVehicleTypes(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id:            string;
      name:          string;
      loading_fee:   number;
      unloading_fee: number;
    }>(
      `SELECT id, name, loading_fee, unloading_fee
       FROM vehicle_types
       WHERE is_active = true
       ORDER BY loading_fee ASC`
    );

    res.json({
      data: {
        vehicleTypes: rows.map((r) => ({
          id:           r.id,
          name:         r.name,
          loadingFee:   r.loading_fee,
          unloadingFee: r.unloading_fee,
        })),
      },
      message: "Vehicle types retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve vehicle types" });
  }
}

export async function createVehicleType(req: Request, res: Response): Promise<void> {
  const { name, loadingFee, unloadingFee } = req.body as {
    name?: unknown;
    loadingFee?: unknown;
    unloadingFee?: unknown;
  };

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "BAD_REQUEST", message: "name is required" });
    return;
  }
  if (!isPositiveInt(loadingFee)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "loadingFee must be a positive integer (kobo)" });
    return;
  }
  if (!isPositiveInt(unloadingFee)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "unloadingFee must be a positive integer (kobo)" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM vehicle_types WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [name.trim()]
    );
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "CONFLICT", message: "A vehicle type with this name already exists" });
      return;
    }

    const { rows: [newType] } = await client.query<{
      id: string;
      name: string;
      loading_fee: number;
      unloading_fee: number;
      is_active: boolean;
      created_at: Date;
    }>(
      `INSERT INTO vehicle_types (name, loading_fee, unloading_fee, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, name, loading_fee, unloading_fee, is_active, created_at`,
      [name.trim(), loadingFee, unloadingFee]
    );

    // Auto-insert ₦0 rates for all active stakeholders on the active pricing chart
    await client.query(
      `INSERT INTO pricing_chart_stakeholder_rates (pricing_chart_id, stakeholder_id, vehicle_type_id, amount)
       SELECT pc.id, s.id, $1, 0
       FROM pricing_charts pc
       CROSS JOIN stakeholders s
       WHERE pc.is_active = true AND s.is_active = true
       ON CONFLICT ON CONSTRAINT pricing_chart_stakeholder_rates_unique DO NOTHING`,
      [newType!.id]
    );

    await client.query("COMMIT");

    res.status(201).json({
      data: {
        vehicleType: {
          id:           newType!.id,
          name:         newType!.name,
          loadingFee:   newType!.loading_fee,
          unloadingFee: newType!.unloading_fee,
          isActive:     newType!.is_active,
          createdAt:    newType!.created_at,
        },
      },
      message: "Vehicle type created",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create vehicle type" });
  } finally {
    client.release();
  }
}

export async function updateVehicleType(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { name, loadingFee, unloadingFee } = req.body as { name?: unknown; loadingFee?: unknown; unloadingFee?: unknown };

  if (name === undefined && loadingFee === undefined && unloadingFee === undefined) {
    res.status(400).json({ error: "BAD_REQUEST", message: "At least one of name, loadingFee or unloadingFee is required" });
    return;
  }
  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    res.status(400).json({ error: "BAD_REQUEST", message: "name must be a non-empty string" });
    return;
  }
  if (loadingFee !== undefined && !isPositiveInt(loadingFee)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "loadingFee must be a positive integer (kobo)" });
    return;
  }
  if (unloadingFee !== undefined && !isPositiveInt(unloadingFee)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "unloadingFee must be a positive integer (kobo)" });
    return;
  }

  try {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM vehicle_types WHERE id = $1 AND is_active = true LIMIT 1`,
      [id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Vehicle type not found" });
      return;
    }

    const trimmedName = typeof name === "string" ? name.trim() : undefined;
    if (trimmedName !== undefined) {
      const collision = await pool.query<{ id: string }>(
        `SELECT id FROM vehicle_types WHERE LOWER(name) = LOWER($1) AND id != $2 AND is_active = true LIMIT 1`,
        [trimmedName, id]
      );
      if (collision.rows.length > 0) {
        res.status(409).json({ error: "CONFLICT", message: "A vehicle type with this name already exists" });
        return;
      }
    }

    const setParts: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [id];
    let idx = 2;
    if (trimmedName !== undefined) {
      setParts.push(`name = $${idx++}`);
      params.push(trimmedName);
    }
    if (loadingFee !== undefined) {
      setParts.push(`loading_fee = $${idx++}`);
      params.push(loadingFee);
    }
    if (unloadingFee !== undefined) {
      setParts.push(`unloading_fee = $${idx++}`);
      params.push(unloadingFee);
    }

    const { rows: [updated] } = await pool.query<{
      id:            string;
      name:          string;
      loading_fee:   number;
      unloading_fee: number;
      is_active:     boolean;
      updated_at:    Date;
    }>(
      `UPDATE vehicle_types SET ${setParts.join(", ")} WHERE id = $1
       RETURNING id, name, loading_fee, unloading_fee, is_active, updated_at`,
      params
    );

    res.json({
      data: {
        vehicleType: {
          id:           updated!.id,
          name:         updated!.name,
          loadingFee:   updated!.loading_fee,
          unloadingFee: updated!.unloading_fee,
          isActive:     updated!.is_active,
          updatedAt:    updated!.updated_at,
        },
      },
      message: "Vehicle type updated",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update vehicle type" });
  }
}

export async function getVehicleTypeVehicleCount(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  try {
    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM vehicles WHERE vehicle_type_id = $1 AND is_active = true AND deleted_at IS NULL`,
      [id]
    );
    const vehicleCount = Number(countRows[0]?.count ?? 0);
    res.json({
      data: { vehicleCount },
      message: "Vehicle count retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve vehicle count" });
  }
}

export async function setVehicleTypeActive(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { isActive } = req.body as { isActive?: unknown };

  if (typeof isActive !== "boolean") {
    res.status(400).json({ error: "BAD_REQUEST", message: "isActive must be a boolean" });
    return;
  }

  try {
    const { rows } = await pool.query<{
      id:            string;
      name:          string;
      loading_fee:   number;
      unloading_fee: number;
      is_active:     boolean;
      updated_at:    Date;
    }>(
      `UPDATE vehicle_types SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, loading_fee, unloading_fee, is_active, updated_at`,
      [isActive, id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "Vehicle type not found" });
      return;
    }

    const updated = rows[0]!;
    res.json({
      data: {
        vehicleType: {
          id:           updated.id,
          name:         updated.name,
          loadingFee:   updated.loading_fee,
          unloadingFee: updated.unloading_fee,
          isActive:     updated.is_active,
          updatedAt:    updated.updated_at,
        },
      },
      message: isActive ? "Vehicle type reactivated" : "Vehicle type deactivated",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update vehicle type status" });
  }
}
