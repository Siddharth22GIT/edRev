import { Router } from "express";
import {
  checkSafeguardsHandler,
  getBlackoutPeriodsHandler,
  getHourLogHandler,
  getSafeguardsHandler,
  overrideHourCapHandler,
  postHourLogHandler,
} from "../controllers/safeguard.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/safeguards", getSafeguardsHandler);
router.get("/safeguards/:studentId", checkSafeguardsHandler);
router.post("/safeguards/hour-cap/override", authenticate, requireRole("FACULTY_DIRECTOR", "ADMINISTRATOR"), overrideHourCapHandler);

router.get("/hours/:studentId", getHourLogHandler);
router.post("/hours", postHourLogHandler);

router.get("/blackouts", getBlackoutPeriodsHandler);

export default router;
