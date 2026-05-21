import { Router } from "express";
import { createTrip, startTrip, completeTrip, cancelTrip } from "../controllers/tripController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

router.post(   "/",                    authenticateToken, requireRole("super_admin"), createTrip);
router.patch(  "/:tripId/start",       authenticateToken, requireRole("driver"),      startTrip);
router.patch(  "/:tripId/complete",    authenticateToken, requireRole("driver"),      completeTrip);
router.patch(  "/:tripId/cancel",      authenticateToken, requireRole("super_admin"), cancelTrip);

export default router;
