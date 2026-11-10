import { Router } from "express";
import {
  checkSafeguardsHandler,
  createBlackoutHandler,
  createOverrideHandler,
  deleteBlackoutHandler,
  getBlackoutPeriodsHandler,
  getHourLogHandler,
  getLimitsHandler,
  getSafeguardsHandler,
  listOverridesHandler,
  overrideHourCapHandler,
  postHourLogHandler,
  revokeOverrideHandler,
  updateComplianceHandler,
  updateLimitsHandler,
} from "../controllers/safeguard.controller.js";
import { getCheckinHandler, getWeekHandler, saveCheckinHandler, startTimerHandler, stopTimerHandler } from "../controllers/hours.controller.js";
import { authenticate, requirePermission, requireSelfOrPermission } from "../middleware/auth.middleware.js";
import { limitPerUser } from "../middleware/security.middleware.js";

// S9: per-user write limits (env RATE_LIMIT_HOURS / RATE_LIMIT_SAFEGUARDS override)
const hoursLimit = limitPerUser("hours", 200, 60 * 60 * 1000);
const safeguardWriteLimit = limitPerUser("safeguards", 60, 60 * 60 * 1000);

const router = Router();

router.get("/safeguards", authenticate, getSafeguardsHandler);
// Phase 4 (G1): limits. Registered before "/safeguards/:studentId" so "limits" isn't read as a student id
router.get("/safeguards/limits", authenticate, getLimitsHandler);
router.put("/safeguards/limits", authenticate, requirePermission("SETTINGS_MANAGE"), safeguardWriteLimit, updateLimitsHandler);
// Phase 4 (G5): overrides of soft rules, with a reason and an expiry
router.post("/safeguards/overrides", authenticate, requirePermission("SAFEGUARD_OVERRIDE"), safeguardWriteLimit, createOverrideHandler);
router.post("/safeguards/overrides/:id/revoke", authenticate, requirePermission("SAFEGUARD_OVERRIDE"), safeguardWriteLimit, revokeOverrideHandler);
router.get("/safeguards/:studentId", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW", "studentId"), checkSafeguardsHandler);
router.get("/safeguards/:studentId/overrides", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW", "studentId"), listOverridesHandler);
router.post("/safeguards/hour-cap/override", authenticate, requirePermission("HOUR_CAP_OVERRIDE"), overrideHourCapHandler);

router.get("/hours/:studentId", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW", "studentId"), getHourLogHandler);
// Phase 4 (D10): the week's hours, entries and running timer
router.get("/hours/:studentId/week", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW", "studentId"), getWeekHandler);
// Students log their own hours; supervisors may log on a student's behalf (checked in the handler)
router.post("/hours", authenticate, hoursLimit, postHourLogHandler);
// Phase 4 (D10): the optional Start/Stop timer on the student's own project
router.post("/hours/timer/start", authenticate, requirePermission("PROJECT_WORK"), hoursLimit, startTimerHandler);
router.post("/hours/timer/stop", authenticate, requirePermission("PROJECT_WORK"), hoursLimit, stopTimerHandler);

// Phase 4 (D10): the Monday check-in (the student, or a supervisor on their behalf)
router.get("/checkins/:studentId", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW", "studentId"), getCheckinHandler);
router.put("/checkins/:studentId/:weekStart", authenticate, requireSelfOrPermission("STUDENT_SUPERVISE", "studentId"), hoursLimit, saveCheckinHandler);

router.get("/blackouts", authenticate, getBlackoutPeriodsHandler);
// Phase 4 (G4): exam blackouts per programme and year
router.post("/blackouts", authenticate, requirePermission("BLACKOUT_MANAGE"), safeguardWriteLimit, createBlackoutHandler);
router.delete("/blackouts/:id", authenticate, requirePermission("BLACKOUT_MANAGE"), safeguardWriteLimit, deleteBlackoutHandler);

// Phase 4 (G3): attendance, backlogs and compliance, recorded by a Faculty Director
router.put("/academic/:studentId/compliance", authenticate, requirePermission("ACADEMIC_RECORD_MANAGE"), safeguardWriteLimit, updateComplianceHandler);

export default router;
