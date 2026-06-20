import { Router } from "express";
import { createDriver, searchDrivers } from "../controllers/driverController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

const guard = [authenticateToken, requireRole("trip_admin")];

router.post(   "/",        ...guard, createDriver);
router.get(    "/search",  ...guard, searchDrivers);

export default router;
