import { Router } from "express";
import { createTrip } from "../controllers/tripController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.post("/", authenticateToken, createTrip);

export default router;
