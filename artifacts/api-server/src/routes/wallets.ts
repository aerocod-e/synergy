import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";
import { getMyWallet, getMyLedger, getAllWallets, toggleClearingEnabled } from "../controllers/walletController.js";

const router = Router();

router.get("/my",        authenticateToken, requireRole("stakeholder", "state_admin"), getMyWallet);
router.get("/my/ledger", authenticateToken, requireRole("stakeholder", "state_admin"), getMyLedger);
router.get("/all",       authenticateToken, requireRole("super_admin"), getAllWallets);
router.patch("/:walletId/clearing", authenticateToken, requireRole("super_admin"), toggleClearingEnabled);

export default router;
