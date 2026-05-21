import { Router } from "express";
import { createTrip } from "../controllers/tripController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

router.post("/", authenticateToken, requireRole("super_admin"), createTrip);

export default router;
