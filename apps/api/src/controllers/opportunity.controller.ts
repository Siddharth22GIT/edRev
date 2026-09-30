import type { Request, Response } from "express";
import {
  allocateOpportunityService,
  getAllocationForOpportunityService,
  getBidsForOpportunityService,
  getOpportunitiesService,
  getOpportunityByIdService,
  submitBidService,
} from "../services/opportunity.service.js";

const errorResponse = (res: Response, message: string, status = 400) =>
  res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || "";

export async function getOpportunitiesHandler(_req: Request, res: Response): Promise<void> {
  try {
    const opps = await getOpportunitiesService();
    res.json({ data: opps });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch opportunities.", 500);
  }
}

export async function getOpportunityByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params.id);
    const opp = await getOpportunityByIdService(id);
    if (!opp) {
      errorResponse(res, "Opportunity not found.", 404);
      return;
    }
    res.json({ data: opp });
  } catch (err: any) {
    errorResponse(res, err.message || "Error fetching opportunity.", 500);
  }
}

export async function getBidsForOpportunityHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params.id);
    const bids = await getBidsForOpportunityService(id);
    res.json({ data: bids });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch bids.", 500);
  }
}

export async function getAllocationForOpportunityHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params.id);
    const allocation = await getAllocationForOpportunityService(id);
    res.json({ data: allocation });
  } catch (err: any) {
    errorResponse(res, err.message || "Error fetching allocation.", 500);
  }
}

export async function submitBidHandler(req: Request, res: Response): Promise<void> {
  const { proposedAmount, estimatedCompletionTime, message, relevantSkills } = req.body;
  const opportunityId = getParam(req.params.id);

  // Authenticated student identity enforcement (Do NOT trust frontend body studentId override)
  const studentId = req.user?.studentId || req.user?.id || req.body.studentId;

  if (!studentId) {
    errorResponse(res, "Authenticated student identity missing.", 401);
    return;
  }

  if (!proposedAmount || !estimatedCompletionTime || !message || !relevantSkills) {
    errorResponse(res, "All bid fields are required.");
    return;
  }

  try {
    const newBid = await submitBidService({
      opportunityId,
      studentId,
      proposedAmount: Number(proposedAmount),
      estimatedCompletionTime,
      message,
      relevantSkills,
    });
    res.status(201).json({ data: newBid });
  } catch (err: any) {
    const status = err.statusCode || (err.message?.includes("already submitted") ? 409 : 400);
    errorResponse(res, err.message || "Unable to submit bid.", status);
  }
}

export async function allocateOpportunityHandler(req: Request, res: Response): Promise<void> {
  const { studentId } = req.body;
  const opportunityId = getParam(req.params.id);
  const allocatedBy = req.user?.name || req.user?.role || req.body.allocatedBy || "BID_DESK_ANALYST";

  if (!studentId) {
    errorResponse(res, "studentId is required.");
    return;
  }

  try {
    const allocation = await allocateOpportunityService(opportunityId, studentId, allocatedBy);
    res.json({ data: allocation });
  } catch (err: any) {
    const status = err.statusCode || 400;
    errorResponse(res, err.message || "Unable to allocate.", status);
  }
}
