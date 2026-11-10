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
import {
  cancelHandler,
  decideExtensionHandler,
  handBackHandler,
  kickoffHandler,
  milestoneDoneHandler,
  pauseHandler,
  requestExtensionHandler,
  resumeHandler,
  reviewSubmissionHandler,
  slaEventsHandler,
  submissionFileHandler,
  submitDeliveryHandler,
} from "../controllers/sla.controller.js";
import { authenticate, requirePermission } from "../middleware/auth.middleware.js";
import { limitPerUser } from "../middleware/security.middleware.js";

// S9: per-user write limits (env RATE_LIMIT_BIDS overrides)
const bidLimit = limitPerUser("bids", 30, 60 * 60 * 1000);
// Phase 4: project work and SLA decisions (env RATE_LIMIT_SLA overrides)
const slaLimit = limitPerUser("sla", 120, 60 * 60 * 1000);

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

// Phase 4 (F2, G10): the allocated student works the project (ownership checked in the service: studentId from the token)
router.post("/:id/kickoff", authenticate, requirePermission("PROJECT_WORK"), slaLimit, kickoffHandler);
router.post("/:id/milestones/:milestoneId/done", authenticate, requirePermission("PROJECT_WORK"), slaLimit, milestoneDoneHandler);
router.post("/:id/submissions", authenticate, requirePermission("PROJECT_WORK"), slaLimit, submitDeliveryHandler);
router.get("/:id/submissions/:submissionId/file", authenticate, submissionFileHandler);
router.post("/:id/extension", authenticate, requirePermission("PROJECT_WORK"), slaLimit, requestExtensionHandler);
router.post("/:id/hand-back", authenticate, requirePermission("PROJECT_WORK"), slaLimit, handBackHandler);
// Staff: accept or ask for a revision (allocators), extensions / pause / cancel (SLA_MANAGE)
router.post("/:id/submissions/:submissionId/review", authenticate, requirePermission("OPPORTUNITY_ALLOCATE"), slaLimit, reviewSubmissionHandler);
router.post("/:id/extension/:extensionId/decision", authenticate, requirePermission("SLA_MANAGE"), slaLimit, decideExtensionHandler);
router.post("/:id/pause", authenticate, requirePermission("SLA_MANAGE"), slaLimit, pauseHandler);
router.post("/:id/resume", authenticate, requirePermission("SLA_MANAGE"), slaLimit, resumeHandler);
router.post("/:id/cancel", authenticate, requirePermission("SLA_MANAGE"), slaLimit, cancelHandler);
// G12: the project's timeline (the allocated student, or staff who see student records)
router.get("/:id/sla-events", authenticate, slaEventsHandler);

export default router;
