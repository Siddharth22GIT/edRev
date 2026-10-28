import { Router } from "express";
import {
  createProposalHandler,
  getAcademicSnapshotHandler,
  getAnalyticsHandler,
  getDashboardHandler,
  getProposalsHandler,
  getSettingsHandler,
  updateSettingsHandler,
} from "../controllers/analytics.controller.js";

import { authenticate, requirePermission, requireSelfOrPermission } from "../middleware/auth.middleware.js";

const router = Router();

// Institutional reporting is staff-only (students have their own home and profile)
router.get("/dashboard", authenticate, requirePermission("ANALYTICS_VIEW"), getDashboardHandler);
router.get("/analytics", authenticate, requirePermission("ANALYTICS_VIEW"), getAnalyticsHandler);
router.get("/proposals", authenticate, getProposalsHandler);
router.post("/proposals", authenticate, requirePermission("PROPOSAL_CREATE"), createProposalHandler);
router.get("/settings", authenticate, getSettingsHandler);
router.put("/settings", authenticate, requirePermission("SETTINGS_MANAGE"), updateSettingsHandler);
router.get("/academic/:studentId", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW", "studentId"), getAcademicSnapshotHandler);

export default router;
