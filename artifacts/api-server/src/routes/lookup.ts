import { Router, type Request, type Response } from "express";
import { publicLookupLimiter } from "../middleware/rateLimiter.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";
import { lookupVehicle } from "../controllers/lookupController.js";
import { listUsers } from "../controllers/userController.js";
import pool from "../db/connection.js";

const router = Router();

// Public lookup
router.get("/vehicle/:vehicleNumber", publicLookupLimiter, lookupVehicle);

// Super-admin lookups
router.get("/users", authenticateToken, requireRole("super_admin"), listUsers);

router.get("/states", authenticateToken, requireRole("super_admin"), async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query<{ id: string; name: string; code: string }>(
      `SELECT id, name, code FROM states ORDER BY name ASC`
    );
    res.json({ data: { states: rows }, message: "States retrieved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve states" });
  }
});

router.get("/stakeholders", authenticateToken, requireRole("super_admin"), async (_req: Request, res: Response) => {
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
});

export default router;
