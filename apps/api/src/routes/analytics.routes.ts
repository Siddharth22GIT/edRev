import { Router } from "express";
import {
  getAcademicSnapshotHandler,
  getAnalyticsHandler,
  getDashboardHandler,
  getProposalsHandler,
  getSettingsHandler,
} from "../controllers/analytics.controller.js";

const router = Router();

router.get("/dashboard", getDashboardHandler);
router.get("/analytics", getAnalyticsHandler);
router.get("/proposals", getProposalsHandler);
router.get("/settings", getSettingsHandler);
router.get("/academic/:studentId", getAcademicSnapshotHandler);

export default router;
