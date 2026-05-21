import { Router } from "express";
import { publicLookupLimiter } from "../middleware/rateLimiter.js";
import { lookupVehicle } from "../controllers/lookupController.js";

const router = Router();

router.get("/vehicle/:vehicleNumber", publicLookupLimiter, lookupVehicle);

export default router;
