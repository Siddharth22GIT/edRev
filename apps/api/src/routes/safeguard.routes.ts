import { Router } from "express";
import {
  checkSafeguardsHandler,
  getBlackoutPeriodsHandler,
  getHourLogHandler,
  getSafeguardsHandler,
  overrideHourCapHandler,
  postHourLogHandler,
} from "../controllers/safeguard.controller.js";
import { authenticate, requirePermission, requireSelfOrPermission } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/safeguards", authenticate, getSafeguardsHandler);
router.get("/safeguards/:studentId", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW", "studentId"), checkSafeguardsHandler);
router.post("/safeguards/hour-cap/override", authenticate, requirePermission("HOUR_CAP_OVERRIDE"), overrideHourCapHandler);

router.get("/hours/:studentId", authenticate, requireSelfOrPermission("STUDENT_RECORDS_VIEW", "studentId"), getHourLogHandler);
// Students log their own hours; supervisors may log on a student's behalf (checked in the handler)
router.post("/hours", authenticate, postHourLogHandler);

router.get("/blackouts", authenticate, getBlackoutPeriodsHandler);

export default router;
