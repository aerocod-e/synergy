import { Router } from "express";
import { createDriver, listDrivers, searchDrivers, updateDriver, deleteDriver } from "../controllers/driverController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

const guard = [authenticateToken, requireRole("trip_admin")];

router.get(    "/",        ...guard, listDrivers);
router.post(   "/",        ...guard, createDriver);
router.get(    "/search",  ...guard, searchDrivers);
router.patch(  "/:id",     ...guard, updateDriver);
router.delete( "/:id",     ...guard, deleteDriver);

export default router;
