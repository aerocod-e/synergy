import { Router } from "express";
import { listVehicleTypes, updateVehicleType, createVehicleType } from "../controllers/vehicleTypeController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

router.get(  "/",    listVehicleTypes);
router.post( "/",    authenticateToken, requireRole("super_admin"), createVehicleType);
router.patch("/:id", authenticateToken, requireRole("super_admin"), updateVehicleType);

export default router;
