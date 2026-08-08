import { Router } from "express";
import {
  createTrip,
  listTrips,
  getTripById,
  startTrip,
  completeTrip,
  markTripBreakdown,
  markTransshipment,
  getTripTransshipmentHistory,
  undoTripStart,
  undoTripBreakdown,
  undoTripTransshipment,
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
router.patch(  "/:tripId/breakdown",             authenticateToken, requireRole("trip_admin"),             markTripBreakdown);
router.patch(  "/:tripId/transshipment",         authenticateToken, requireRole("trip_admin"),             markTransshipment);
router.get(    "/:tripId/transshipment-history", authenticateToken, requireRole("super_admin", "trip_admin", "state_admin"), getTripTransshipmentHistory);
router.patch(  "/:tripId/undo-start",             authenticateToken, requireRole("trip_admin"),             undoTripStart);
router.patch(  "/:tripId/undo-breakdown",         authenticateToken, requireRole("trip_admin"),             undoTripBreakdown);
router.patch(  "/:tripId/undo-transshipment",     authenticateToken, requireRole("trip_admin"),             undoTripTransshipment);

export default router;
