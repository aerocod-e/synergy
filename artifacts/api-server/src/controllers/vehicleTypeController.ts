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

export async function updateVehicleType(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { loadingFee, unloadingFee } = req.body as { loadingFee?: unknown; unloadingFee?: unknown };

  if (loadingFee === undefined && unloadingFee === undefined) {
    res.status(400).json({ error: "BAD_REQUEST", message: "At least one of loadingFee or unloadingFee is required" });
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

    const setParts: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [id];
    let idx = 2;
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
