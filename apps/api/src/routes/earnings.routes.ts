import { Router } from "express";
import {
  getEarningsHandler,
  getEarningsSummaryHandler,
  getPlatformAccountsHandler,
  submitEarningHandler,
  verifyEarningHandler,
} from "../controllers/earnings.controller.js";
import { authenticate, requirePermission } from "../middleware/auth.middleware.js";

const router = Router();

// Specific sub-paths must be registered before parameterized paths
router.get("/earnings/summary", authenticate, getEarningsSummaryHandler);
router.get("/earnings", authenticate, getEarningsHandler);
router.post("/earnings", authenticate, requirePermission("EARNINGS_SUBMIT"), submitEarningHandler);
router.patch("/earnings/:id/verify", authenticate, requirePermission("EARNINGS_VERIFY"), verifyEarningHandler);

router.get("/platform-accounts", authenticate, getPlatformAccountsHandler);

export default router;
