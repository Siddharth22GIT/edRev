import { Router } from "express";
import {
  createProposalHandler,
  getAcademicSnapshotHandler,
  getAnalyticsHandler,
  getDashboardHandler,
  getProposalsHandler,
  getSettingsHandler,
} from "../controllers/analytics.controller.js";

import { authenticate, requirePermission, requireSelfOrPermission } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/dashboard", authenticate, getDashboardHandler);
router.get("/analytics", authenticate, getAnalyticsHandler);
router.get("/proposals", authenticate, getProposalsHandler);
router.post("/proposals", authenticate, requirePermission("PROPOSAL_CREATE"), createProposalHandler);
router.get("/settings", authenticate, getSettingsHandler);
router.get("/academic/:studentId", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW", "studentId"), getAcademicSnapshotHandler);

export default router;
