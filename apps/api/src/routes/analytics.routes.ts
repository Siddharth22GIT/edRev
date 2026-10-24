import { Router } from "express";
import {
  createProposalHandler,
  getAcademicSnapshotHandler,
  getAnalyticsHandler,
  getDashboardHandler,
  getProposalsHandler,
  getSettingsHandler,
} from "../controllers/analytics.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/dashboard", authenticate, getDashboardHandler);
router.get("/analytics", authenticate, getAnalyticsHandler);
router.get("/proposals", getProposalsHandler);
router.post("/proposals", createProposalHandler);
router.get("/settings", getSettingsHandler);
router.get("/academic/:studentId", getAcademicSnapshotHandler);

export default router;
