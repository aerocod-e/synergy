import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";
import { getMyWallet, getMyLedger, getAllWallets } from "../controllers/walletController.js";

const router = Router();

router.get("/my",        authenticateToken, requireRole("trip_admin", "stakeholder", "state_admin"), getMyWallet);
router.get("/my/ledger", authenticateToken, requireRole("trip_admin", "stakeholder", "state_admin"), getMyLedger);
router.get("/all",       authenticateToken, requireRole("super_admin"), getAllWallets);

export default router;
