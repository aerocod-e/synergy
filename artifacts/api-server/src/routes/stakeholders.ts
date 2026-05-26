import { Router } from "express";
import { type Request, type Response } from "express";
import pool from "../db/connection.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

async function listStakeholders(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      description: string | null;
      is_active: boolean;
    }>(
      `SELECT id, name, description, is_active FROM stakeholders ORDER BY name ASC`
    );

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

router.get("/", authenticateToken, requireRole("super_admin"), listStakeholders);

export default router;
