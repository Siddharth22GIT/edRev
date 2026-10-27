import { Router } from "express";
import {
  allocateOpportunityHandler,
  createOpportunityHandler,
  getAllocationForOpportunityHandler,
  getBidProposalDocumentHandler,
  getBidsForOpportunityHandler,
  getOpportunitiesHandler,
  getOpportunityByIdHandler,
  submitBidHandler,
} from "../controllers/opportunity.controller.js";
import { authenticate, requirePermission } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authenticate, getOpportunitiesHandler);
router.post("/", authenticate, requirePermission("OPPORTUNITY_CREATE"), createOpportunityHandler);
router.get("/:id", authenticate, getOpportunityByIdHandler);
// Staff see every bid; students only their own (scoped in the handlers)
router.get("/:id/bids", authenticate, getBidsForOpportunityHandler);
router.get("/:id/bids/:bidId/proposal", authenticate, getBidProposalDocumentHandler);
router.get("/:id/allocation", authenticate, getAllocationForOpportunityHandler);

router.post("/:id/bids", authenticate, requirePermission("BID_SUBMIT"), submitBidHandler);
router.post("/:id/allocate", authenticate, requirePermission("OPPORTUNITY_ALLOCATE"), allocateOpportunityHandler);

export default router;
