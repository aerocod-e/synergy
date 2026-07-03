import { type Request, type Response } from "express";
import pool from "../db/connection.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createVehicle(req: Request, res: Response): Promise<void> {
  const { registrationNumber, vehicleTypeId } = req.body as {
    registrationNumber?: unknown;
    vehicleTypeId?: unknown;
  };

  if (!registrationNumber || typeof registrationNumber !== "string" || registrationNumber.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "registrationNumber is required" });
    return;
  }
  const regNum = registrationNumber.trim().toUpperCase();
  if (regNum.length > 50) {
    res.status(400).json({ error: "BAD_REQUEST", message: "registrationNumber must be 50 characters or fewer" });
    return;
  }

  if (!vehicleTypeId || typeof vehicleTypeId !== "string" || !UUID_RE.test(vehicleTypeId)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "vehicleTypeId is required and must be a valid UUID" });
    return;
  }

  const createdBy = req.user!.userId;

  try {
    // Validate vehicleTypeId exists
    const vtCheck = await pool.query<{ id: string }>(
      `SELECT id FROM vehicle_types WHERE id = $1 AND is_active = true LIMIT 1`,
      [vehicleTypeId]
    );
    if (vtCheck.rows.length === 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "vehicleTypeId does not reference an active vehicle type" });
      return;
    }

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
        vehicle_type_id: string | null;
        vehicle_type_name: string | null;
        created_by: string;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      }>(
        `UPDATE vehicles
         SET is_active = true, deleted_at = NULL, created_by = $2, vehicle_type_id = $3, updated_at = NOW()
         WHERE id = $1
         RETURNING
           id, registration_number, vehicle_type_id, created_by, is_active, created_at, updated_at,
           (SELECT name FROM vehicle_types WHERE id = $3) AS vehicle_type_name`,
        [v.id, createdBy, vehicleTypeId]
      );
      res.status(201).json({
        data: {
          id:                 reactivated!.id,
          registrationNumber: reactivated!.registration_number,
          vehicleTypeId:      reactivated!.vehicle_type_id,
          vehicleTypeName:    reactivated!.vehicle_type_name,
          createdBy:          reactivated!.created_by,
          isActive:           reactivated!.is_active,
          createdAt:          reactivated!.created_at,
          updatedAt:          reactivated!.updated_at,
        },
        message: "Vehicle registered",
      });
      return;
    }

    const { rows: [vehicle] } = await pool.query<{
      id: string;
      registration_number: string;
      vehicle_type_id: string | null;
      vehicle_type_name: string | null;
      created_by: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO vehicles (registration_number, vehicle_type_id, created_by, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING
         id, registration_number, vehicle_type_id, created_by, is_active, created_at, updated_at,
         (SELECT name FROM vehicle_types WHERE id = $2) AS vehicle_type_name`,
      [regNum, vehicleTypeId, createdBy]
    );

    res.status(201).json({
      data: {
        id:                 vehicle!.id,
        registrationNumber: vehicle!.registration_number,
        vehicleTypeId:      vehicle!.vehicle_type_id,
        vehicleTypeName:    vehicle!.vehicle_type_name,
        createdBy:          vehicle!.created_by,
        isActive:           vehicle!.is_active,
        createdAt:          vehicle!.created_at,
        updatedAt:          vehicle!.updated_at,
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
      id:               string;
      registration_number: string;
      vehicle_type_id:  string | null;
      vehicle_type_name: string | null;
      created_by:       string;
      is_active:        boolean;
      created_at:       Date;
    }>(
      `SELECT
         v.id,
         v.registration_number,
         v.vehicle_type_id,
         vt.name AS vehicle_type_name,
         v.created_by,
         v.is_active,
         v.created_at
       FROM   vehicles v
       LEFT   JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
       WHERE  v.registration_number ILIKE $1
         AND  v.is_active = true
         AND  v.deleted_at IS NULL
       ORDER  BY
         CASE WHEN v.registration_number ILIKE $2 THEN 0 ELSE 1 END,
         v.registration_number
       LIMIT  10`,
      [`%${q}%`, `${q}%`]
    );

    res.json({
      data: rows.map((v) => ({
        id:                 v.id,
        registrationNumber: v.registration_number,
        vehicleTypeId:      v.vehicle_type_id,
        vehicleTypeName:    v.vehicle_type_name,
        createdBy:          v.created_by,
        isActive:           v.is_active,
        createdAt:          v.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to search vehicles" });
  }
}

export async function listVehicles(req: Request, res: Response): Promise<void> {
  const ownerId = req.user!.userId;

  const rawPage  = parseInt((req.query.page  as string) ?? "1",  10);
  const rawLimit = parseInt((req.query.limit as string) ?? "20", 10);
  const page     = Number.isFinite(rawPage)  && rawPage  > 0 ? rawPage                   : 1;
  const limit    = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100)   : 20;
  const offset   = (page - 1) * limit;
  const searchQuery    = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  const vehicleTypeId  = typeof req.query.vehicleTypeId === "string" ? req.query.vehicleTypeId : undefined;

  const params: unknown[] = [ownerId];
  let idx = 2;
  const extraFilters: string[] = [];
  if (searchQuery) {
    params.push(`%${searchQuery}%`);
    extraFilters.push(`v.registration_number ILIKE $${idx++}`);
  }
  if (vehicleTypeId) {
    params.push(vehicleTypeId);
    extraFilters.push(`v.vehicle_type_id = $${idx++}`);
  }
  const extraWhere = extraFilters.length > 0 ? `AND ${extraFilters.join(" AND ")}` : "";

  try {
    const [countRes, rowsRes] = await Promise.all([
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total
         FROM   vehicles v
         WHERE  v.created_by = $1
           AND  v.is_active = true
           AND  v.deleted_at IS NULL
           ${extraWhere}`,
        params
      ),
      pool.query<{
        id:               string;
        registration_number: string;
        vehicle_type_id:  string | null;
        vehicle_type_name: string | null;
        is_active:        boolean;
        created_at:       Date;
        updated_at:       Date;
        trip_count:       string;
      }>(
        `SELECT
           v.id,
           v.registration_number,
           v.vehicle_type_id,
           vt.name AS vehicle_type_name,
           v.is_active,
           v.created_at,
           v.updated_at,
           COUNT(t.id) AS trip_count
         FROM   vehicles v
         LEFT   JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
         LEFT   JOIN trips t ON t.vehicle_id = v.id AND t.deleted_at IS NULL
         WHERE  v.created_by = $1
           AND  v.is_active = true
           AND  v.deleted_at IS NULL
           ${extraWhere}
         GROUP  BY v.id, vt.name
         ORDER  BY v.created_at DESC
         LIMIT  $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
    ]);

    const total      = parseInt(countRes.rows[0]!.total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      data: {
        vehicles: rowsRes.rows.map((v) => ({
          id:                 v.id,
          registrationNumber: v.registration_number,
          vehicleTypeId:      v.vehicle_type_id,
          vehicleTypeName:    v.vehicle_type_name,
          isActive:           v.is_active,
          createdAt:          v.created_at,
          updatedAt:          v.updated_at,
          tripCount:          parseInt(v.trip_count, 10),
        })),
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list vehicles" });
  }
}

export async function updateVehicle(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const ownerId = req.user!.userId;

  const { registrationNumber, vehicleTypeId } = req.body as {
    registrationNumber?: unknown;
    vehicleTypeId?: unknown;
  };

  if (!registrationNumber || typeof registrationNumber !== "string" || registrationNumber.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "registrationNumber is required" });
    return;
  }
  const regNum = registrationNumber.trim().toUpperCase();
  if (regNum.length > 50) {
    res.status(400).json({ error: "BAD_REQUEST", message: "registrationNumber must be 50 characters or fewer" });
    return;
  }

  // vehicleTypeId is optional on update — if provided, validate it
  if (vehicleTypeId !== undefined) {
    if (typeof vehicleTypeId !== "string" || !UUID_RE.test(vehicleTypeId)) {
      res.status(400).json({ error: "BAD_REQUEST", message: "vehicleTypeId must be a valid UUID" });
      return;
    }
  }

  try {
    if (vehicleTypeId !== undefined) {
      const vtCheck = await pool.query<{ id: string }>(
        `SELECT id FROM vehicle_types WHERE id = $1 AND is_active = true LIMIT 1`,
        [vehicleTypeId]
      );
      if (vtCheck.rows.length === 0) {
        res.status(400).json({ error: "BAD_REQUEST", message: "vehicleTypeId does not reference an active vehicle type" });
        return;
      }
    }

    const vehicleRes = await pool.query<{
      id: string;
      created_by: string;
      is_active: boolean;
      deleted_at: Date | null;
    }>(
      `SELECT id, created_by, is_active, deleted_at FROM vehicles WHERE id = $1 LIMIT 1`,
      [id]
    );

    const row = vehicleRes.rows[0];
    if (!row || !row.is_active || row.deleted_at !== null) {
      res.status(404).json({ error: "NOT_FOUND", message: "Vehicle not found" });
      return;
    }
    if (row.created_by !== ownerId) {
      res.status(403).json({ error: "FORBIDDEN", message: "You do not own this vehicle" });
      return;
    }

    const activeTrip = await pool.query<{ id: string }>(
      `SELECT id FROM trips
       WHERE vehicle_id = $1
         AND status IN ('created', 'in_transit')
         AND deleted_at IS NULL
       LIMIT 1`,
      [id]
    );
    if (activeTrip.rows.length > 0) {
      res.status(400).json({ error: "ACTIVE_TRIP", message: "Cannot edit a vehicle with active trips" });
      return;
    }

    const conflict = await pool.query<{ id: string }>(
      `SELECT id FROM vehicles
       WHERE registration_number = $1
         AND is_active = true
         AND deleted_at IS NULL
         AND id != $2
       LIMIT 1`,
      [regNum, id]
    );
    if (conflict.rows.length > 0) {
      res.status(409).json({ error: "CONFLICT", message: "A vehicle with this registration number already exists" });
      return;
    }

    const setParts = ["registration_number = $2", "updated_at = NOW()"];
    const params: unknown[] = [id, regNum];
    let idx = 3;
    if (vehicleTypeId !== undefined) {
      setParts.push(`vehicle_type_id = $${idx++}`);
      params.push(vehicleTypeId);
    }

    const { rows: [updated] } = await pool.query<{
      id:               string;
      registration_number: string;
      vehicle_type_id:  string | null;
      vehicle_type_name: string | null;
      created_by:       string;
      is_active:        boolean;
      created_at:       Date;
      updated_at:       Date;
    }>(
      `UPDATE vehicles SET ${setParts.join(", ")} WHERE id = $1
       RETURNING
         id, registration_number, vehicle_type_id, created_by, is_active, created_at, updated_at,
         (SELECT name FROM vehicle_types WHERE id = vehicle_type_id) AS vehicle_type_name`,
      params
    );

    res.json({
      data: {
        id:                 updated!.id,
        registrationNumber: updated!.registration_number,
        vehicleTypeId:      updated!.vehicle_type_id,
        vehicleTypeName:    updated!.vehicle_type_name,
        createdBy:          updated!.created_by,
        isActive:           updated!.is_active,
        createdAt:          updated!.created_at,
        updatedAt:          updated!.updated_at,
      },
      message: "Vehicle updated",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update vehicle" });
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
