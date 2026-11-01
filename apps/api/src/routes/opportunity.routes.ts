import { Router } from "express";
import {
  allocateOpportunityHandler,
  createOpportunityHandler,
  getAllocationForOpportunityHandler,
  getBidProposalDocumentHandler,
  getBidsForOpportunityHandler,
  getOpportunitiesHandler,
  getOpportunityByIdHandler,
  reassignAllocationHandler,
  submitBidHandler,
  updateMyBidHandler,
  withdrawMyBidHandler,
} from "../controllers/opportunity.controller.js";
import { confirmDeliveryHandler } from "../controllers/delivery.controller.js";
import { authenticate, requirePermission } from "../middleware/auth.middleware.js";
import { limitPerUser } from "../middleware/security.middleware.js";

// S9: per-user write limits (env RATE_LIMIT_BIDS overrides)
const bidLimit = limitPerUser("bids", 30, 60 * 60 * 1000);

const router = Router();

router.get("/", authenticate, getOpportunitiesHandler);
router.post("/", authenticate, requirePermission("OPPORTUNITY_CREATE"), createOpportunityHandler);
router.get("/:id", authenticate, getOpportunityByIdHandler);
// Staff see every bid; students only their own (scoped in the handlers)
router.get("/:id/bids", authenticate, getBidsForOpportunityHandler);
router.get("/:id/bids/:bidId/proposal", authenticate, getBidProposalDocumentHandler);
router.get("/:id/allocation", authenticate, getAllocationForOpportunityHandler);

router.post("/:id/bids", authenticate, requirePermission("BID_SUBMIT"), bidLimit, submitBidHandler);
// E5: a student edits or withdraws their own bid ("mine" = identity from the token, never from the body)
router.patch("/:id/bids/mine", authenticate, requirePermission("BID_SUBMIT"), bidLimit, updateMyBidHandler);
router.post("/:id/bids/mine/withdraw", authenticate, requirePermission("BID_SUBMIT"), withdrawMyBidHandler);
router.post("/:id/allocate", authenticate, requirePermission("OPPORTUNITY_ALLOCATE"), allocateOpportunityHandler);
// E1b: move allocated work to another student (Coordinator, Administrator), with a recorded reason
router.post("/:id/reassign", authenticate, requirePermission("ALLOCATION_REASSIGN"), reassignAllocationHandler);
// Staff who allocate work also confirm its delivery (records on-time evidence for the top tier)
router.post("/:id/delivery", authenticate, requirePermission("OPPORTUNITY_ALLOCATE"), confirmDeliveryHandler);

export default router;
