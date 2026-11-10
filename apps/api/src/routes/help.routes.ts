import { Router } from "express";
import { createHelpRequestHandler, listHelpRequestsHandler, resolveHelpRequestHandler } from "../controllers/help.controller.js";
import { authenticate, requirePermission } from "../middleware/auth.middleware.js";
import { limitPerUser } from "../middleware/security.middleware.js";

// Phase 4 (G6): "Request help" from a blocked student. Doc: docs/modules/safeguards.md §6
const helpLimit = limitPerUser("help", 10, 60 * 60 * 1000);
const router = Router();

// Students see their own; staff with HELP_RESOLVE see the ones routed to their role (checked in the service)
router.get("/", authenticate, listHelpRequestsHandler);
router.post("/", authenticate, requirePermission("HELP_REQUEST"), helpLimit, createHelpRequestHandler);
router.post("/:id/resolve", authenticate, requirePermission("HELP_RESOLVE"), resolveHelpRequestHandler);

export default router;
