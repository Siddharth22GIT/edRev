import { Router } from "express";
import { runChecksHandler, slaBoardHandler } from "../controllers/sla.controller.js";
import { authenticate, requirePermission } from "../middleware/auth.middleware.js";

// Phase 4 (G12): the staff SLA board and a manual run of the daily checks. Doc: docs/modules/sla-and-delivery.md
const router = Router();

router.get("/board", authenticate, requirePermission("SLA_BOARD_VIEW"), slaBoardHandler);
router.post("/run-checks", authenticate, requirePermission("SETTINGS_MANAGE"), runChecksHandler);

export default router;
