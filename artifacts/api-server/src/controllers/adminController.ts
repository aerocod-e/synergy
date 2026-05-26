import { type Request, type Response } from "express";
import pool from "../db/connection.js";

export async function listStates(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query<{ id: string; name: string; code: string }>(
      `SELECT id, name, code FROM states ORDER BY name ASC`
    );
    res.json({ data: { states: rows }, message: "States retrieved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve states" });
  }
}

export async function listStakeholders(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      description: string | null;
      is_active: boolean;
    }>(`SELECT id, name, description, is_active FROM stakeholders ORDER BY name ASC`);
    res.json({
      data: {
        stakeholders: rows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          isActive: r.is_active,
        })),
      },
      message: "Stakeholders retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve stakeholders" });
  }
}
