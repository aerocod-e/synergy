import { Router } from 'express';
import { getVehicleAudit } from '../controllers/auditController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';

const router = Router();

router.get('/vehicles', authenticateToken, requireRole('trip_admin'), getVehicleAudit);

export default router;
