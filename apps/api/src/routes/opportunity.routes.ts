import { Router } from "express";
import {
  allocateOpportunityHandler,
  getAllocationForOpportunityHandler,
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
router.get("/:id/allocation", getAllocationForOpportunityHandler);

router.post("/:id/bids", authenticate, requireRole("STUDENT"), submitBidHandler);
router.post("/:id/allocate", authenticate, requireRole("BID_DESK_ANALYST", "CELL_COORDINATOR", "ADMINISTRATOR"), allocateOpportunityHandler);

export default router;
