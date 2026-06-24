import { Router } from "express";
import {
  createVehicle,
  searchVehicles,
  listVehicles,
  deleteVehicle,
  updateVehicle,
} from "../controllers/vehicleController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

const guard = [authenticateToken, requireRole("trip_admin")];

router.get(    "/",        ...guard, listVehicles);
router.get(    "/search",  ...guard, searchVehicles);
router.post(   "/",        ...guard, createVehicle);
router.patch(  "/:id",     ...guard, updateVehicle);
router.delete( "/:id",     ...guard, deleteVehicle);

export default router;
