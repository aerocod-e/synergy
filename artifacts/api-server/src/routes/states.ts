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
    }>(
      `SELECT id, name, code FROM states ORDER BY name ASC`
    );

    res.json({
      data: {
        states: rows.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
        })),
      },
      message: "States retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve states" });
  }
}

router.get("/", authenticateToken, requireRole("super_admin", "trip_admin", "state_admin"), listStates);

export default router;
