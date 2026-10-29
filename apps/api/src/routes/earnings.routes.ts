import { Router } from "express";
import {
  getEarningsHandler,
  getEarningsSummaryHandler,
  getPlatformAccountsHandler,
  submitEarningHandler,
  verifyEarningHandler,
} from "../controllers/earnings.controller.js";
import { authenticate, requirePermission } from "../middleware/auth.middleware.js";
import { limitPerUser } from "../middleware/security.middleware.js";

// S9: per-user write limits (env RATE_LIMIT_EARNINGS overrides)
const earningLimit = limitPerUser("earnings", 30, 60 * 60 * 1000);

const router = Router();

// Specific sub-paths must be registered before parameterized paths
router.get("/earnings/summary", authenticate, getEarningsSummaryHandler);
router.get("/earnings", authenticate, getEarningsHandler);
router.post("/earnings", authenticate, requirePermission("EARNINGS_SUBMIT"), earningLimit, submitEarningHandler);
router.patch("/earnings/:id/verify", authenticate, requirePermission("EARNINGS_VERIFY"), verifyEarningHandler);

router.get("/platform-accounts", authenticate, getPlatformAccountsHandler);

export default router;
