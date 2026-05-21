import { Router } from "express";
import { login, refresh, logout, me } from "../controllers/authController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", authenticateToken, logout);
router.get("/me", authenticateToken, me);

export default router;
