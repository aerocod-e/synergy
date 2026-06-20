import { type Request, type Response } from "express";
import pool from "../db/connection.js";

export async function createDriver(req: Request, res: Response): Promise<void> {
  const { full_name, license_number, phone_number } = req.body as {
    full_name?: unknown;
    license_number?: unknown;
    phone_number?: unknown;
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

  const fullName   = full_name.trim();
  const licenseNum = license_number.trim().toUpperCase();
  const phoneNum   = phone_number.trim();
  const createdBy  = req.user!.userId;

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
      }>(
        `UPDATE drivers
         SET full_name = $2, phone_number = $3, created_by = $4,
             is_active = true, deleted_at = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING id, full_name, license_number, phone_number, created_by, is_active, created_at`,
        [d.id, fullName, phoneNum, createdBy]
      );
      res.status(201).json({
        data: {
          id:            reactivated!.id,
          fullName:      reactivated!.full_name,
          licenseNumber: reactivated!.license_number,
          phoneNumber:   reactivated!.phone_number,
          createdBy:     reactivated!.created_by,
          isActive:      reactivated!.is_active,
          createdAt:     reactivated!.created_at,
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
    }>(
      `INSERT INTO drivers (full_name, license_number, phone_number, created_by, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, full_name, license_number, phone_number, created_by, is_active, created_at`,
      [fullName, licenseNum, phoneNum, createdBy]
    );

    res.status(201).json({
      data: {
        id:            driver!.id,
        fullName:      driver!.full_name,
        licenseNumber: driver!.license_number,
        phoneNumber:   driver!.phone_number,
        createdBy:     driver!.created_by,
        isActive:      driver!.is_active,
        createdAt:     driver!.created_at,
      },
      message: "Driver registered",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to register driver" });
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
    }>(
      `SELECT id, full_name, license_number, phone_number, created_by, is_active, created_at
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
        id:            d.id,
        fullName:      d.full_name,
        licenseNumber: d.license_number,
        phoneNumber:   d.phone_number,
        createdBy:     d.created_by,
        isActive:      d.is_active,
        createdAt:     d.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to search drivers" });
  }
}
