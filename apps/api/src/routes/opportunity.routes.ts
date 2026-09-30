import { Router } from "express";
import {
  allocateOpportunityHandler,
  getBidsForOpportunityHandler,
  getOpportunitiesHandler,
  getOpportunityByIdHandler,
  submitBidHandler,
} from "../controllers/opportunity.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", getOpportunitiesHandler);
router.get("/:id", getOpportunityByIdHandler);
router.get("/:id/bids", getBidsForOpportunityHandler);

router.post("/:id/bids", authenticate, requireRole("STUDENT"), submitBidHandler);
router.post("/:id/allocate", authenticate, requireRole("BID_DESK_ANALYST", "ADMINISTRATOR"), allocateOpportunityHandler);

export default router;
