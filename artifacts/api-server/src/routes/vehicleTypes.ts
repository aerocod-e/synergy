import { Router } from "express";
import { listVehicleTypes, updateVehicleType } from "../controllers/vehicleTypeController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

router.get(  "/",    listVehicleTypes);
router.patch("/:id", authenticateToken, requireRole("super_admin"), updateVehicleType);

export default router;
