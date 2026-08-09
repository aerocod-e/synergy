import { Router } from "express";
import {
  createBulkPayment,
  listBulkPayments,
  reverseBulkPayment,
  removeBulkPayment,
  unarchiveBulkPayment,
} from "../controllers/bulkPaymentController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

router.get(   "/",              authenticateToken, requireRole("super_admin"), listBulkPayments);
router.post(  "/",              authenticateToken, requireRole("super_admin"), createBulkPayment);
router.post(  "/:id/reverse",   authenticateToken, requireRole("super_admin"), reverseBulkPayment);
router.post(  "/:id/remove",    authenticateToken, requireRole("super_admin"), removeBulkPayment);
router.patch( "/:id/unarchive", authenticateToken, requireRole("super_admin"), unarchiveBulkPayment);

export default router;
