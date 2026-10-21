import { Router } from "express";
import {
  getEarningsHandler,
  getEarningsSummaryHandler,
  getPlatformAccountsHandler,
  submitEarningHandler,
  verifyEarningHandler,
} from "../controllers/earnings.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

// Specific sub-paths must be registered before parameterized paths
router.get("/earnings/summary", authenticate, getEarningsSummaryHandler);
router.get("/earnings", authenticate, getEarningsHandler);
router.post("/earnings", authenticate, requireRole("STUDENT"), submitEarningHandler);
router.patch(
  "/earnings/:id/verify",
  authenticate,
  requireRole("FACULTY_DIRECTOR", "CELL_COORDINATOR", "ADMINISTRATOR", "DEAN"),
  verifyEarningHandler
);

router.get("/platform-accounts", authenticate, getPlatformAccountsHandler);

export default router;
