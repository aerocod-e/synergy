import { Router } from "express";
import { type Request, type Response } from "express";
import pool from "../db/connection.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

async function listStates(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      code: string;
      loading_rate: number;
      unloading_rate: number;
    }>(
      `SELECT id, name, code, loading_rate, unloading_rate FROM states ORDER BY name ASC`
    );

    res.json({
      data: { states: rows },
      message: "States retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve states" });
  }
}

async function updateStateRates(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { loading_rate, unloading_rate } = req.body as {
    loading_rate?: unknown;
    unloading_rate?: unknown;
  };

  function isPositiveInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v) && v > 0;
  }

  if (!isPositiveInt(loading_rate)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "loading_rate must be a positive integer (kobo)" });
    return;
  }
  if (!isPositiveInt(unloading_rate)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "unloading_rate must be a positive integer (kobo)" });
    return;
  }

  try {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      code: string;
      loading_rate: number;
      unloading_rate: number;
    }>(
      `UPDATE states
       SET loading_rate = $1, unloading_rate = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, code, loading_rate, unloading_rate`,
      [loading_rate, unloading_rate, id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "State not found" });
      return;
    }

    res.json({ data: { state: rows[0] }, message: "State rates updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update state rates" });
  }
}

router.get("/", authenticateToken, requireRole("super_admin", "trip_admin"), listStates);
router.patch("/:id/rates", authenticateToken, requireRole("super_admin"), updateStateRates);

export default router;
