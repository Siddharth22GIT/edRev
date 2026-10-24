import { Router } from "express";
import {
  getEarningsHandler,
  getPlatformAccountsHandler,
  getStudentEarningsSummaryHandler,
  submitEarningHandler,
  verifyEarningHandler,
} from "../controllers/earnings.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/earnings", authenticate, getEarningsHandler);
router.get("/earnings/summary", authenticate, getStudentEarningsSummaryHandler);
router.post("/earnings", authenticate, submitEarningHandler);
router.patch("/earnings/:id/verify", authenticate, requireRole("FACULTY_DIRECTOR", "CELL_COORDINATOR", "ADMINISTRATOR"), verifyEarningHandler);

router.get("/platform-accounts", getPlatformAccountsHandler);

export default router;
