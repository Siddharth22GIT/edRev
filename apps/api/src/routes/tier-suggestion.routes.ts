import { Router } from "express";
import {
  approveTierSuggestionHandler,
  dismissTierSuggestionHandler,
  listTierSuggestionsHandler,
} from "../controllers/onboarding.controller.js";
import { authenticate, requirePermission } from "../middleware/auth.middleware.js";

const router = Router();

// Tier suggestions are decided by whoever may change official tiers (Administrator)
router.get("/", authenticate, requirePermission("TIER_UPDATE"), listTierSuggestionsHandler);
router.post("/:id/approve", authenticate, requirePermission("TIER_UPDATE"), approveTierSuggestionHandler);
router.post("/:id/dismiss", authenticate, requirePermission("TIER_UPDATE"), dismissTierSuggestionHandler);

export default router;
