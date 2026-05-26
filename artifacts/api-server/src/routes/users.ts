import { Router } from "express";
import { listUsers } from "../controllers/userController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

router.get("/", authenticateToken, requireRole("super_admin"), listUsers);

export default router;
