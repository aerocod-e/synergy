import { type Request, type Response } from "express";
import pool from "../db/connection.js";
import { TRIP_STATUS } from "../constants/tripStatus.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

export async function createDriver(req: Request, res: Response): Promise<void> {
  const { full_name, license_number, phone_number, license_expiry_date } = req.body as {
    full_name?: unknown;
    license_number?: unknown;
    phone_number?: unknown;
    license_expiry_date?: unknown;
  };

  if (!full_name || typeof full_name !== "string" || full_name.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "full_name is required" });
    return;
  }
  if (!license_number || typeof license_number !== "string" || license_number.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "license_number is required" });
    return;
  }
  if (!phone_number || typeof phone_number !== "string" || phone_number.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "phone_number is required" });
    return;
  }
  if (!license_expiry_date || !isValidDateString(license_expiry_date)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "license_expiry_date is required and must be a valid date (YYYY-MM-DD)" });
    return;
  }

  const fullName    = full_name.trim();
  const licenseNum  = license_number.trim().toUpperCase();
  const phoneNum    = phone_number.trim();
  const expiryDate  = license_expiry_date;
  const createdBy   = req.user!.userId;

  try {
    const existing = await pool.query<{
      id: string;
      is_active: boolean;
      deleted_at: Date | null;
    }>(
      `SELECT id, is_active, deleted_at FROM drivers WHERE license_number = $1 LIMIT 1`,
      [licenseNum]
    );

    if (existing.rows.length > 0) {
      const d = existing.rows[0]!;
      if (d.is_active && d.deleted_at === null) {
        res.status(409).json({ error: "CONFLICT", message: "A driver with this license number already exists" });
        return;
      }
      const { rows: [reactivated] } = await pool.query<{
        id: string;
        full_name: string;
        license_number: string;
        phone_number: string;
        created_by: string;
        is_active: boolean;
        created_at: Date;
        license_expiry_date: Date | null;
      }>(
        `UPDATE drivers
         SET full_name = $2, phone_number = $3, created_by = $4,
             license_expiry_date = $5, is_active = true, deleted_at = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING id, full_name, license_number, phone_number, created_by, is_active, created_at, license_expiry_date`,
        [d.id, fullName, phoneNum, createdBy, expiryDate]
      );
      res.status(201).json({
        data: {
          id:                reactivated!.id,
          fullName:          reactivated!.full_name,
          licenseNumber:     reactivated!.license_number,
          phoneNumber:       reactivated!.phone_number,
          createdBy:         reactivated!.created_by,
          isActive:          reactivated!.is_active,
          createdAt:         reactivated!.created_at,
          licenseExpiryDate: reactivated!.license_expiry_date,
        },
        message: "Driver registered",
      });
      return;
    }

    const { rows: [driver] } = await pool.query<{
      id: string;
      full_name: string;
      license_number: string;
      phone_number: string;
      created_by: string;
      is_active: boolean;
      created_at: Date;
      license_expiry_date: Date | null;
    }>(
      `INSERT INTO drivers (full_name, license_number, phone_number, created_by, is_active, license_expiry_date)
       VALUES ($1, $2, $3, $4, true, $5)
       RETURNING id, full_name, license_number, phone_number, created_by, is_active, created_at, license_expiry_date`,
      [fullName, licenseNum, phoneNum, createdBy, expiryDate]
    );

    res.status(201).json({
      data: {
        id:                driver!.id,
        fullName:          driver!.full_name,
        licenseNumber:     driver!.license_number,
        phoneNumber:       driver!.phone_number,
        createdBy:         driver!.created_by,
        isActive:          driver!.is_active,
        createdAt:         driver!.created_at,
        licenseExpiryDate: driver!.license_expiry_date,
      },
      message: "Driver registered",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to register driver" });
  }
}

export async function listDrivers(req: Request, res: Response): Promise<void> {
  const createdBy = req.user!.userId;

  const rawPage  = parseInt((req.query.page  as string) ?? "1",  10);
  const rawLimit = parseInt((req.query.limit as string) ?? "20", 10);
  const page     = Number.isFinite(rawPage)  && rawPage  > 0 ? rawPage                   : 1;
  const limit    = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100)   : 20;
  const offset   = (page - 1) * limit;
  const searchQuery   = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  const statusFilter  = typeof req.query.status === "string" ? req.query.status : undefined;

  if (statusFilter && statusFilter !== "valid" && statusFilter !== "expired") {
    res.status(400).json({ error: "BAD_REQUEST", message: "status must be valid or expired" });
    return;
  }

  const params: unknown[] = [createdBy];
  let idx = 2;
  const extraFilters: string[] = [];
  if (searchQuery) {
    params.push(`%${searchQuery}%`);
    extraFilters.push(`(d.full_name ILIKE $${idx} OR d.license_number ILIKE $${idx})`);
    idx++;
  }
  if (statusFilter === "valid") {
    extraFilters.push(`(d.license_expiry_date IS NULL OR d.license_expiry_date >= CURRENT_DATE)`);
  } else if (statusFilter === "expired") {
    extraFilters.push(`(d.license_expiry_date IS NOT NULL AND d.license_expiry_date < CURRENT_DATE)`);
  }
  const extraWhere = extraFilters.length > 0 ? `AND ${extraFilters.join(" AND ")}` : "";

  try {
    const [countRes, rowsRes] = await Promise.all([
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total
         FROM   drivers d
         WHERE  d.created_by = $1
           AND  d.is_active = true
           AND  d.deleted_at IS NULL
           ${extraWhere}`,
        params
      ),
      pool.query<{
        id: string;
        full_name: string;
        license_number: string;
        phone_number: string;
        created_by: string;
        is_active: boolean;
        created_at: Date;
        trip_count: string;
        license_expiry_date: Date | null;
      }>(
        `SELECT d.id, d.full_name, d.license_number, d.phone_number,
                d.created_by, d.is_active, d.created_at, d.license_expiry_date,
                COUNT(t.id) AS trip_count
         FROM   drivers d
         LEFT   JOIN trips t ON t.driver_id = d.id
         WHERE  d.created_by = $1
           AND  d.is_active = true
           AND  d.deleted_at IS NULL
           ${extraWhere}
         GROUP  BY d.id
         ORDER  BY d.full_name
         LIMIT  $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
    ]);

    const total      = parseInt(countRes.rows[0]!.total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      data: {
        drivers: rowsRes.rows.map((d) => ({
          id:                d.id,
          fullName:          d.full_name,
          licenseNumber:     d.license_number,
          phoneNumber:       d.phone_number,
          createdBy:         d.created_by,
          isActive:          d.is_active,
          createdAt:         d.created_at,
          tripCount:         Number(d.trip_count),
          licenseExpiryDate: d.license_expiry_date,
        })),
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list drivers" });
  }
}

export async function updateDriver(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const callerId = req.user!.userId;

  const { full_name, phone_number } = req.body as {
    full_name?: unknown;
    phone_number?: unknown;
  };

  const hasName  = full_name  !== undefined && full_name  !== null;
  const hasPhone = phone_number !== undefined && phone_number !== null;

  if (!hasName && !hasPhone) {
    res.status(400).json({ error: "BAD_REQUEST", message: "At least one of full_name or phone_number is required" });
    return;
  }
  if (hasName && (typeof full_name !== "string" || full_name.trim() === "")) {
    res.status(400).json({ error: "BAD_REQUEST", message: "full_name must be a non-empty string" });
    return;
  }
  if (hasPhone && (typeof phone_number !== "string" || phone_number.trim() === "")) {
    res.status(400).json({ error: "BAD_REQUEST", message: "phone_number must be a non-empty string" });
    return;
  }

  try {
    const existing = await pool.query<{
      id: string;
      created_by: string;
      is_active: boolean;
      deleted_at: Date | null;
      full_name: string;
      license_number: string;
      phone_number: string;
      created_at: Date;
    }>(
      `SELECT id, created_by, is_active, deleted_at, full_name, license_number, phone_number, created_at
       FROM drivers WHERE id = $1 LIMIT 1`,
      [id]
    );

    const row = existing.rows[0];
    if (!row || !row.is_active || row.deleted_at !== null) {
      res.status(404).json({ error: "NOT_FOUND", message: "Driver not found" });
      return;
    }
    if (row.created_by !== callerId) {
      res.status(403).json({ error: "FORBIDDEN", message: "You do not own this driver" });
      return;
    }

    const newFullName    = hasName  ? (full_name  as string).trim() : row.full_name;
    const newPhoneNumber = hasPhone ? (phone_number as string).trim() : row.phone_number;

    const { rows: [updated] } = await pool.query<{
      id: string;
      full_name: string;
      license_number: string;
      phone_number: string;
      created_by: string;
      is_active: boolean;
      created_at: Date;
    }>(
      `UPDATE drivers
       SET full_name = $2, phone_number = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING id, full_name, license_number, phone_number, created_by, is_active, created_at`,
      [id, newFullName, newPhoneNumber]
    );

    res.json({
      data: {
        id:            updated!.id,
        fullName:      updated!.full_name,
        licenseNumber: updated!.license_number,
        phoneNumber:   updated!.phone_number,
        createdBy:     updated!.created_by,
        isActive:      updated!.is_active,
        createdAt:     updated!.created_at,
      },
      message: "Driver updated",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update driver" });
  }
}

export async function deleteDriver(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const callerId = req.user!.userId;

  try {
    const { rows } = await pool.query<{
      id: string;
      created_by: string;
      is_active: boolean;
      deleted_at: Date | null;
    }>(
      `SELECT id, created_by, is_active, deleted_at FROM drivers WHERE id = $1 LIMIT 1`,
      [id]
    );

    const row = rows[0];
    if (!row || !row.is_active || row.deleted_at !== null) {
      res.status(404).json({ error: "NOT_FOUND", message: "Driver not found" });
      return;
    }
    if (row.created_by !== callerId) {
      res.status(403).json({ error: "FORBIDDEN", message: "You do not own this driver" });
      return;
    }

    const activeTrip = await pool.query<{ id: string }>(
      `SELECT id FROM trips
       WHERE  driver_id = $1
         AND  status IN ('${TRIP_STATUS.CREATED}', '${TRIP_STATUS.IN_TRANSIT}')
         AND  deleted_at IS NULL
       LIMIT  1`,
      [id]
    );
    if (activeTrip.rows.length > 0) {
      res.status(400).json({
        error: "ACTIVE_TRIP",
        message: "Cannot delete a driver who has active trips",
      });
      return;
    }

    await pool.query(
      `UPDATE drivers SET is_active = false, deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({ data: { id }, message: "Driver has been removed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to delete driver" });
  }
}

export async function searchDrivers(req: Request, res: Response): Promise<void> {
  const q = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";

  if (q === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "Query parameter q is required" });
    return;
  }

  try {
    const { rows } = await pool.query<{
      id: string;
      full_name: string;
      license_number: string;
      phone_number: string;
      created_by: string;
      is_active: boolean;
      created_at: Date;
      license_expiry_date: Date | null;
    }>(
      `SELECT id, full_name, license_number, phone_number, created_by, is_active, created_at, license_expiry_date
       FROM   drivers
       WHERE  (full_name ILIKE $1 OR license_number ILIKE $1 OR phone_number ILIKE $1)
         AND  is_active = true
         AND  deleted_at IS NULL
       ORDER  BY full_name
       LIMIT  10`,
      [`%${q}%`]
    );

    res.json({
      data: rows.map((d) => ({
        id:                d.id,
        fullName:          d.full_name,
        licenseNumber:     d.license_number,
        phoneNumber:       d.phone_number,
        licenseExpiryDate: d.license_expiry_date,
        createdBy:         d.created_by,
        isActive:          d.is_active,
        createdAt:         d.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to search drivers" });
  }
}

export async function updateDriverLicense(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const callerId = req.user!.userId;

  const { license_number, license_expiry_date } = req.body as {
    license_number?: unknown;
    license_expiry_date?: unknown;
  };

  if (!license_number || typeof license_number !== "string" || license_number.trim() === "") {
    res.status(400).json({ error: "BAD_REQUEST", message: "license_number is required" });
    return;
  }
  if (!license_expiry_date || !isValidDateString(license_expiry_date)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "license_expiry_date is required and must be a valid date (YYYY-MM-DD)" });
    return;
  }

  const newLicenseNum = license_number.trim().toUpperCase();
  const newExpiryDate = license_expiry_date;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{
      id: string;
      created_by: string;
      is_active: boolean;
      deleted_at: Date | null;
      license_number: string;
      license_expiry_date: Date | null;
    }>(
      `SELECT id, created_by, is_active, deleted_at, license_number, license_expiry_date
       FROM drivers WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [id]
    );

    const row = existing.rows[0];
    if (!row || !row.is_active || row.deleted_at !== null) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "NOT_FOUND", message: "Driver not found" });
      return;
    }
    if (row.created_by !== callerId) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "FORBIDDEN", message: "You do not own this driver" });
      return;
    }

    if (newLicenseNum !== row.license_number) {
      const dup = await client.query<{ id: string }>(
        `SELECT id FROM drivers WHERE license_number = $1 AND id != $2 AND is_active = true AND deleted_at IS NULL LIMIT 1`,
        [newLicenseNum, id]
      );
      if (dup.rows.length > 0) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "CONFLICT", message: "A driver with this license number already exists" });
        return;
      }
    }

    await client.query(
      `INSERT INTO driver_license_history
         (driver_id, old_license_number, new_license_number, old_expiry_date, new_expiry_date, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, row.license_number, newLicenseNum, row.license_expiry_date, newExpiryDate, callerId]
    );

    const { rows: [updated] } = await client.query<{
      id: string;
      full_name: string;
      license_number: string;
      phone_number: string;
      created_by: string;
      is_active: boolean;
      created_at: Date;
      license_expiry_date: Date | null;
    }>(
      `UPDATE drivers
       SET license_number = $2, license_expiry_date = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING id, full_name, license_number, phone_number, created_by, is_active, created_at, license_expiry_date`,
      [id, newLicenseNum, newExpiryDate]
    );

    await client.query("COMMIT");

    res.json({
      data: {
        id:                updated!.id,
        fullName:          updated!.full_name,
        licenseNumber:     updated!.license_number,
        phoneNumber:       updated!.phone_number,
        createdBy:         updated!.created_by,
        isActive:          updated!.is_active,
        createdAt:         updated!.created_at,
        licenseExpiryDate: updated!.license_expiry_date,
      },
      message: "Driver license updated",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update driver license" });
  } finally {
    client.release();
  }
}

export async function getDriverLicenseHistory(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const callerId = req.user!.userId;

  try {
    const driverRes = await pool.query<{ id: string; created_by: string }>(
      `SELECT id, created_by FROM drivers WHERE id = $1 LIMIT 1`,
      [id]
    );

    const driver = driverRes.rows[0];
    if (!driver) {
      res.status(404).json({ error: "NOT_FOUND", message: "Driver not found" });
      return;
    }
    if (driver.created_by !== callerId) {
      res.status(403).json({ error: "FORBIDDEN", message: "You do not own this driver" });
      return;
    }

    const { rows } = await pool.query<{
      id: string;
      driver_id: string;
      old_license_number: string | null;
      new_license_number: string;
      old_expiry_date: Date | null;
      new_expiry_date: Date;
      changed_by: string | null;
      changed_at: Date;
    }>(
      `SELECT id, driver_id, old_license_number, new_license_number,
              old_expiry_date, new_expiry_date, changed_by, changed_at
       FROM   driver_license_history
       WHERE  driver_id = $1
       ORDER  BY changed_at DESC`,
      [id]
    );

    res.json({
      data: rows.map((h) => ({
        id:               h.id,
        driverId:         h.driver_id,
        oldLicenseNumber: h.old_license_number,
        newLicenseNumber: h.new_license_number,
        oldExpiryDate:    h.old_expiry_date,
        newExpiryDate:    h.new_expiry_date,
        changedBy:        h.changed_by,
        changedAt:        h.changed_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch driver license history" });
  }
}

export async function getDriver(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const callerId = req.user!.userId;

  try {
    const { rows } = await pool.query<{
      id: string;
      full_name: string;
      license_number: string;
      phone_number: string;
      created_by: string;
      is_active: boolean;
      created_at: Date;
      license_expiry_date: Date | null;
    }>(
      `SELECT id, full_name, license_number, phone_number, created_by, is_active, created_at, license_expiry_date
       FROM drivers WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );

    const driver = rows[0];
    if (!driver) {
      res.status(404).json({ error: "NOT_FOUND", message: "Driver not found" });
      return;
    }
    if (driver.created_by !== callerId) {
      res.status(403).json({ error: "FORBIDDEN", message: "You do not own this driver" });
      return;
    }

    res.json({
      data: {
        id:                driver.id,
        fullName:          driver.full_name,
        licenseNumber:     driver.license_number,
        phoneNumber:       driver.phone_number,
        createdBy:         driver.created_by,
        isActive:          driver.is_active,
        createdAt:         driver.created_at,
        licenseExpiryDate: driver.license_expiry_date,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch driver" });
  }
}
