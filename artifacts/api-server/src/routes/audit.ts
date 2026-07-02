import { Router } from 'express';
import { getDriverAudit, getTripAdminAudit, getVehicleAudit } from '../controllers/auditController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';

const router = Router();

router.get('/vehicles',    authenticateToken, requireRole('trip_admin'),  getVehicleAudit);
router.get('/drivers',     authenticateToken, requireRole('trip_admin'),  getDriverAudit);
router.get('/trip-admins', authenticateToken, requireRole('state_admin'), getTripAdminAudit);

export default router;
