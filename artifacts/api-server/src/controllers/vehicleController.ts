import { type Request, type Response } from "express";
import pool from "../db/connection.js";

export async function createVehicle(req: Request, res: Response): Promise<void> {
  const { registrationNumber } = req.body as { registrationNumber?: unknown };

  if (!registrationNumber || typeof registrationNumber !== "string" || registrationNumber.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "registrationNumber is required" });
    return;
  }

  const regNum = registrationNumber.trim().toUpperCase();
  const createdBy = req.user!.userId;

  try {
    // Check if a vehicle with this plate already exists (including soft-deleted)
    const existing = await pool.query<{
      id: string;
      is_active: boolean;
      deleted_at: Date | null;
    }>(
      `SELECT id, is_active, deleted_at FROM vehicles WHERE registration_number = $1 LIMIT 1`,
      [regNum]
    );

    if (existing.rows.length > 0) {
      const v = existing.rows[0]!;
      if (v.is_active && v.deleted_at === null) {
        res.status(409).json({ error: "CONFLICT", message: "A vehicle with this registration number already exists" });
        return;
      }
      // Reactivate soft-deleted vehicle
      const { rows: [reactivated] } = await pool.query<{
        id: string;
        registration_number: string;
        created_by: string;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      }>(
        `UPDATE vehicles
         SET is_active = true, deleted_at = NULL, created_by = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [v.id, createdBy]
      );
      res.status(201).json({
        data: {
          id: reactivated!.id,
          registrationNumber: reactivated!.registration_number,
          createdBy: reactivated!.created_by,
          isActive: reactivated!.is_active,
          createdAt: reactivated!.created_at,
          updatedAt: reactivated!.updated_at,
        },
        message: "Vehicle registered",
      });
      return;
    }

    const { rows: [vehicle] } = await pool.query<{
      id: string;
      registration_number: string;
      created_by: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO vehicles (registration_number, created_by, is_active)
       VALUES ($1, $2, true)
       RETURNING *`,
      [regNum, createdBy]
    );

    res.status(201).json({
      data: {
        id: vehicle!.id,
        registrationNumber: vehicle!.registration_number,
        createdBy: vehicle!.created_by,
        isActive: vehicle!.is_active,
        createdAt: vehicle!.created_at,
        updatedAt: vehicle!.updated_at,
      },
      message: "Vehicle registered",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to register vehicle" });
  }
}

export async function searchVehicles(req: Request, res: Response): Promise<void> {
  const q = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";

  if (q === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "Query parameter q is required" });
    return;
  }

  try {
    const { rows } = await pool.query<{
      id: string;
      registration_number: string;
      created_by: string;
      is_active: boolean;
      created_at: Date;
    }>(
      `SELECT id, registration_number, created_by, is_active, created_at
       FROM   vehicles
       WHERE  registration_number ILIKE $1
         AND  is_active = true
         AND  deleted_at IS NULL
       ORDER  BY registration_number
       LIMIT  10`,
      [`%${q}%`]
    );

    res.json({
      data: rows.map((v) => ({
        id: v.id,
        registrationNumber: v.registration_number,
        createdBy: v.created_by,
        isActive: v.is_active,
        createdAt: v.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to search vehicles" });
  }
}

export async function listVehicles(req: Request, res: Response): Promise<void> {
  const ownerId = req.user!.userId;

  try {
    const { rows } = await pool.query<{
      id: string;
      registration_number: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      trip_count: string;
    }>(
      `SELECT v.id,
              v.registration_number,
              v.is_active,
              v.created_at,
              v.updated_at,
              COUNT(t.id) AS trip_count
       FROM   vehicles v
       LEFT   JOIN trips t ON t.vehicle_id = v.id AND t.deleted_at IS NULL
       WHERE  v.created_by = $1
         AND  v.is_active = true
         AND  v.deleted_at IS NULL
       GROUP  BY v.id
       ORDER  BY v.created_at DESC`,
      [ownerId]
    );

    res.json({
      data: rows.map((v) => ({
        id: v.id,
        registrationNumber: v.registration_number,
        isActive: v.is_active,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
        tripCount: parseInt(v.trip_count, 10),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list vehicles" });
  }
}

export async function deleteVehicle(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const ownerId = req.user!.userId;

  try {
    const vehicleRes = await pool.query<{
      id: string;
      created_by: string;
      is_active: boolean;
      deleted_at: Date | null;
    }>(
      `SELECT id, created_by, is_active, deleted_at FROM vehicles WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (vehicleRes.rows.length === 0 || !vehicleRes.rows[0]!.is_active || vehicleRes.rows[0]!.deleted_at !== null) {
      res.status(404).json({ error: "NOT_FOUND", message: "Vehicle not found" });
      return;
    }

    if (vehicleRes.rows[0]!.created_by !== ownerId) {
      res.status(403).json({ error: "FORBIDDEN", message: "You do not own this vehicle" });
      return;
    }

    // Block delete if vehicle has an active trip
    const activeTrip = await pool.query<{ id: string }>(
      `SELECT id FROM trips
       WHERE  vehicle_id = $1
         AND  status IN ('created', 'in_transit')
         AND  deleted_at IS NULL
       LIMIT  1`,
      [id]
    );

    if (activeTrip.rows.length > 0) {
      res.status(400).json({
        error: "ACTIVE_TRIP",
        message: "Cannot delete a vehicle that has an active trip",
      });
      return;
    }

    await pool.query(
      `UPDATE vehicles SET is_active = false, deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({ data: { id }, message: "Vehicle deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to delete vehicle" });
  }
}
