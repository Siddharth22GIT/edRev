import { Router } from "express";
import { approveSignupHandler, listSignupRequestsHandler, rejectSignupHandler } from "../controllers/signup.controller.js";
import { authenticate, requirePermission } from "../middleware/auth.middleware.js";

const router = Router();

// Only Cell Coordinators and Administrators review student sign-ups
router.get("/", authenticate, requirePermission("SIGNUP_REVIEW"), listSignupRequestsHandler);
router.post("/:id/approve", authenticate, requirePermission("SIGNUP_REVIEW"), approveSignupHandler);
router.post("/:id/reject", authenticate, requirePermission("SIGNUP_REVIEW"), rejectSignupHandler);

export default router;
