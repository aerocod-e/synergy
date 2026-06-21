import { Router } from "express";
import {
  listCancellationRequests,
  approveCancellation,
  rejectCancellation,
} from "../controllers/cancellationController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

router.get(   "/",          authenticateToken, requireRole("state_admin"), listCancellationRequests);
router.patch( "/:id/approve", authenticateToken, requireRole("state_admin"), approveCancellation);
router.patch( "/:id/reject",  authenticateToken, requireRole("state_admin"), rejectCancellation);

export default router;
