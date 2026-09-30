import type { Allocation, Bid, Opportunity } from "@edurev/types";
import {
  allocate as mockAllocate,
  getBids as mockGetBids,
  getOpportunity as mockGetOpportunity,
  opportunities as mockOpportunities,
  submitBid as mockSubmitBid,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AllocationModel, BidModel, OpportunityModel } from "../models/index.js";
import { checkSafeguardsService } from "./safeguard.service.js";

export async function getOpportunitiesService(): Promise<Opportunity[]> {
  if (isDbConnected()) {
    const opps = await OpportunityModel.find().lean();
    return opps.map((item) => stripMongoFields<Opportunity>(item));
  }
  return mockOpportunities;
}

export async function getOpportunityByIdService(id: string): Promise<Opportunity | null> {
  if (isDbConnected()) {
    const opp = await OpportunityModel.findOne({ id }).lean();
    return opp ? stripMongoFields<Opportunity>(opp) : null;
  }
  return mockGetOpportunity(id) ?? null;
}

export async function getBidsForOpportunityService(opportunityId: string): Promise<Bid[]> {
  if (isDbConnected()) {
    const bids = await BidModel.find({ opportunityId }).lean();
    return bids.map((item) => stripMongoFields<Bid>(item));
  }
  return mockGetBids(opportunityId);
}

export interface SubmitBidInput {
  opportunityId: string;
  studentId: string;
  proposedAmount: number;
  estimatedCompletionTime: string;
  message: string;
  relevantSkills: string;
}

export async function submitBidService(input: SubmitBidInput): Promise<Bid> {
  if (isDbConnected()) {
    const opportunity = await OpportunityModel.findOne({ id: input.opportunityId });
    if (!opportunity) {
      const err: any = new Error("Opportunity not found.");
      err.statusCode = 404;
      throw err;
    }

    const existing = await BidModel.findOne({ opportunityId: input.opportunityId, studentId: input.studentId });
    if (existing) {
      const err: any = new Error("You have already submitted a bid for this opportunity.");
      err.statusCode = 409;
      throw err;
    }

    const bidId = `bid-${Date.now()}`;
    const newBid = {
      id: bidId,
      opportunityId: input.opportunityId,
      studentId: input.studentId,
      proposedAmount: input.proposedAmount,
      estimatedCompletionTime: input.estimatedCompletionTime,
      message: input.message,
      relevantSkills: input.relevantSkills,
      status: "SUBMITTED" as const,
      createdAt: new Date().toISOString(),
    };

    try {
      const created = await BidModel.create(newBid);

      opportunity.numberOfBids = (opportunity.numberOfBids || 0) + 1;
      opportunity.status = "UNDER_REVIEW";
      await opportunity.save();

      return stripMongoFields<Bid>(created.toObject());
    } catch (error: any) {
      if (error.code === 11000 || error.message?.includes("E11000")) {
        const err: any = new Error("You have already submitted a bid for this opportunity.");
        err.statusCode = 409;
        throw err;
      }
      throw error;
    }
  }

  return mockSubmitBid(input);
}

export async function allocateOpportunityService(opportunityId: string, studentId: string, allocatedBy: string): Promise<Allocation> {
  const check = await checkSafeguardsService(studentId, opportunityId);
  if (!check.eligible) {
    const err: any = new Error(check.reasons.join(" "));
    err.statusCode = 400;
    throw err;
  }

  if (isDbConnected()) {
    const opp = await OpportunityModel.findOne({ id: opportunityId });
    if (!opp) {
      const err: any = new Error("Opportunity not found.");
      err.statusCode = 404;
      throw err;
    }

    const now = new Date();
    const slaDeadlineDate = opp.slaDeadline ? new Date(opp.slaDeadline) : new Date(now.getTime() + 72 * 3600 * 1000);

    const newAllocation = {
      opportunityId,
      studentId,
      allocatedBy,
      allocatedAt: now.toISOString(),
      status: "ALLOCATED" as const,
      slaStartAt: now.toISOString(),
      slaDeadline: slaDeadlineDate.toISOString(),
      slaStatus: "ACTIVE" as const,
    };

    await AllocationModel.create(newAllocation);

    opp.status = "ALLOCATED";
    opp.allocatedStudentId = studentId;
    await opp.save();

    return {
      opportunityId,
      studentId,
      allocatedBy,
      allocatedAt: now.toISOString(),
      status: "ALLOCATED",
    };
  }

  return mockAllocate(opportunityId, studentId, allocatedBy);
}

function stripMongoFields<T>(obj: any): T {
  if (!obj) return obj as T;
  const { _id, __v, ...rest } = obj;
  return rest as T;
}
