import { Router } from "express";
import { listUsers, createUser } from "../controllers/userController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

router.get( "/", authenticateToken, requireRole("super_admin"),                        listUsers);
router.post("/", authenticateToken, requireRole("super_admin", "state_admin"), createUser);

export default router;
