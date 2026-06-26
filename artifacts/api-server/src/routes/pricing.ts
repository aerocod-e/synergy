import { Router } from "express";
import {
  createPricingChart,
  updatePricingChart,
  getActivePricingChart,
  activatePricingChart,
  addStakeholderRate,
  updateStakeholderRate,
} from "../controllers/pricingController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleGuard.js";

const router = Router();

router.get(  "/active",                       authenticateToken, requireRole("super_admin", "trip_admin"), getActivePricingChart);
router.post( "/",                             authenticateToken, requireRole("super_admin"),               createPricingChart);
router.put(  "/:id",                          authenticateToken, requireRole("super_admin"),               updatePricingChart);
router.post( "/:id/activate",                 authenticateToken, requireRole("super_admin"),               activatePricingChart);
router.post( "/:chartId/stakeholders",        authenticateToken, requireRole("super_admin"),               addStakeholderRate);
router.patch("/:chartId/stakeholder-rates",   authenticateToken, requireRole("super_admin"),               updateStakeholderRate);

export default router;
