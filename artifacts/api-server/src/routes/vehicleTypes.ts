import { Router } from "express";
import {
  listVehicleTypes,
  updateVehicleType,
  createVehicleType,
  getVehicleTypeVehicleCount,
  setVehicleTypeActive,
} from "../controllers/vehicleTypeController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

router.get(  "/",                     listVehicleTypes);
router.post( "/",                     authenticateToken, requireRole("super_admin"), createVehicleType);
router.patch("/:id",                  authenticateToken, requireRole("super_admin"), updateVehicleType);
router.get(  "/:id/vehicle-count",    authenticateToken, requireRole("super_admin"), getVehicleTypeVehicleCount);
router.patch("/:id/active",           authenticateToken, requireRole("super_admin"), setVehicleTypeActive);

export default router;
