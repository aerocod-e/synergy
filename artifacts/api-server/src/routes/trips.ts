import { Router } from "express";
import {
  createTrip,
  listTrips,
  getTripById,
  startTrip,
  completeTrip,
} from "../controllers/tripController.js";
import { requestCancellation } from "../controllers/cancellationController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

router.get(    "/",                              authenticateToken, requireRole("super_admin", "driver", "trip_admin", "state_admin"), listTrips);
router.get(    "/:tripId",                       authenticateToken, requireRole("super_admin", "driver", "trip_admin", "state_admin"), getTripById);
router.post(   "/",                              authenticateToken, requireRole("trip_admin"),             createTrip);
router.patch(  "/:tripId/start",                 authenticateToken, requireRole("trip_admin"),             startTrip);
router.patch(  "/:tripId/complete",              authenticateToken, requireRole("trip_admin"),             completeTrip);
router.patch(  "/:tripId/request-cancellation",  authenticateToken, requireRole("trip_admin"),             requestCancellation);

export default router;
