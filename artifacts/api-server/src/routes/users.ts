import { Router } from "express";
import { listUsers, listTripAdmins, createUser, toggleUserActive, getTripAdminActiveTripsCount, resetUserPassword } from "../controllers/userController.js";
import { updateCancellationRights } from "../controllers/cancellationController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

router.get(   "/",                        authenticateToken, requireRole("super_admin"),                   listUsers);
router.get(   "/trip-admins",             authenticateToken, requireRole("state_admin"),                   listTripAdmins);
router.post(  "/",                        authenticateToken, requireRole("super_admin", "state_admin"),    createUser);
router.patch( "/:id/cancellation-rights", authenticateToken, requireRole("state_admin"),                  updateCancellationRights);
router.get(   "/:id/active-trips-count",  authenticateToken, requireRole("state_admin"),                  getTripAdminActiveTripsCount);
router.patch( "/:id/active",              authenticateToken, requireRole("state_admin"),                  toggleUserActive);
router.post(  "/:id/reset-password",      authenticateToken, requireRole("super_admin"),                  resetUserPassword);

export default router;
