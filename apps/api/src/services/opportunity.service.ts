import type { Allocation, Bid, Opportunity, SlaStatus } from "@edurev/types";
import {
  allocate as mockAllocate,
  allocations as mockAllocations,
  bids as mockBids,
  getBids as mockGetBids,
  getOpportunity as mockGetOpportunity,
  opportunities as mockOpportunities,
  submitBid as mockSubmitBid,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AllocationModel, BidModel, OpportunityModel, StudentModel } from "../models/index.js";
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

export async function getBidProposalDocumentService(
  opportunityId: string,
  bidId: string
): Promise<{
  buffer: Buffer;
  mimeType: string;
  filename: string;
  isPdf: boolean;
  isDocx: boolean;
  studentId: string;
} | null> {
  let bid: Bid | null = null;
  if (isDbConnected()) {
    const found = await BidModel.findOne({
      opportunityId,
      $or: [{ id: bidId }, { studentId: bidId }],
    }).lean();
    if (found) {
      bid = stripMongoFields<Bid>(found);
    }
  } else {
    const list = mockGetBids(opportunityId);
    bid = list.find((b) => b.id === bidId || b.studentId === bidId) ?? null;
  }

  if (!bid || !bid.proposalPdfUrl) {
    return null;
  }

  const dataUrl = bid.proposalPdfUrl;
  let buffer: Buffer;
  let declaredMime = "application/pdf";

  if (dataUrl.startsWith("data:")) {
    const parts = dataUrl.split(",");
    const match = parts[0].match(/:(.*?);/);
    if (match) declaredMime = match[1];
    buffer = Buffer.from(parts[1] || "", "base64");
  } else {
    buffer = Buffer.from(dataUrl, "base64");
  }

  const isPdf = buffer.subarray(0, 4).toString("utf-8") === "%PDF";
  const isDocx = buffer.subarray(0, 4).toString("utf-8") === "PK\x03\x04";

  let mimeType = declaredMime || "application/pdf";
  let defaultExt = ".pdf";

  if (isDocx) {
    mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    defaultExt = ".docx";
  } else if (isPdf) {
    mimeType = "application/pdf";
    defaultExt = ".pdf";
  }

  let rawName = bid.proposalPdfName || `proposal-${bid.studentId}${defaultExt}`;
  // Strip illegal whitespace before the extension (e.g. "Rubrics .pdf" -> "Rubrics.pdf")
  rawName = rawName.replace(/\s+\./g, ".").trim();
  // Strip characters forbidden in standard filenames
  rawName = rawName.replace(/[/\\?%*:|"<>]/g, "_");

  // Guarantee valid extension matching detected format
  if (isDocx && !rawName.toLowerCase().endsWith(".docx")) {
    rawName = rawName.replace(/\.[^/.]+$/, "") + ".docx";
  } else if (isPdf && !rawName.toLowerCase().endsWith(".pdf")) {
    rawName = rawName.replace(/\.[^/.]+$/, "") + ".pdf";
  }

  return {
    buffer,
    mimeType,
    filename: rawName,
    isPdf,
    isDocx,
    studentId: bid.studentId,
  };
}

export async function getAllocationForOpportunityService(opportunityId: string): Promise<Allocation | null> {
  if (isDbConnected()) {
    const allocation = await AllocationModel.findOne({ opportunityId }).lean();
    if (allocation) {
      const alloc = stripMongoFields<Allocation>(allocation);
      // Compute dynamic SLA status based on deadline
      if (alloc.slaDeadline && alloc.slaStatus === "ACTIVE" && new Date() > new Date(alloc.slaDeadline)) {
        alloc.slaStatus = "OVERDUE";
      }
      return alloc;
    }
    return null;
  }
  return mockAllocations.find((a) => a.opportunityId === opportunityId) ?? null;
}

export async function createOpportunityService(input: Partial<Opportunity>): Promise<Opportunity> {
  const oppId = input.id || `opp-${Date.now()}`;
  const newOpp: Opportunity = {
    id: oppId,
    title: input.title || input.project || "New Opportunity",
    project: input.project || input.title || "New Project",
    description: input.description || "Client deliverable scope and specifications.",
    client: input.client || input.company || "Enterprise Partner",
    company: input.company || input.client || "Client Co.",
    category: input.category || "Design & Development",
    skills: input.skills && input.skills.length > 0 ? input.skills : ["General"],
    budget: Number(input.budget) || 10000,
    currency: input.currency || "INR",
    deadline: input.deadline || new Date(Date.now() + 14 * 86400000).toISOString(),
    status: (input.status as any) || "OPEN",
    requiredTier: (input.requiredTier as any) || "TIER_1",
    estimatedHours: Number(input.estimatedHours) || 20,
    numberOfBids: 0,
    slaDeadline: input.slaDeadline || new Date(Date.now() + 7 * 86400000).toISOString(),
    matchScore: Number(input.matchScore) || 95,
    deliverables: input.deliverables && input.deliverables.length > 0 ? input.deliverables : ["Initial Research", "Draft Submission", "Final Handoff"],
    updatedAt: new Date().toISOString(),
  };

  if (isDbConnected()) {
    const created = await OpportunityModel.create(newOpp);
    return stripMongoFields<Opportunity>(created.toObject());
  }

  mockOpportunities.unshift(newOpp);
  return newOpp;
}

export interface SubmitBidInput {
  opportunityId: string;
  studentId: string;
  proposedAmount: number;
  estimatedCompletionTime: string;
  message: string;
  relevantSkills: string;
  proposalPdfUrl?: string;
  proposalPdfName?: string;
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
      proposalPdfUrl: input.proposalPdfUrl,
      proposalPdfName: input.proposalPdfName,
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
  // Check academic and hour safeguards
  const check = await checkSafeguardsService(studentId, opportunityId);
  if (!check.eligible) {
    const err: any = new Error(`Allocation blocked: ${check.reasons.join(". ")}`);
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

    const student = await StudentModel.findOne({ id: studentId });
    if (!student) {
      const err: any = new Error("Student not found.");
      err.statusCode = 404;
      throw err;
    }

    // Verify bid exists
    const bid = await BidModel.findOne({ opportunityId, studentId });
    if (bid) {
      bid.status = "ALLOCATED";
      await bid.save();
    }

    const now = new Date();
    const slaDeadlineDate = opp.slaDeadline ? new Date(opp.slaDeadline) : new Date(now.getTime() + 72 * 3600 * 1000);

    // Create or update persistent Allocation record
    let allocation = await AllocationModel.findOne({ opportunityId });
    if (allocation) {
      allocation.studentId = studentId;
      allocation.allocatedBy = allocatedBy;
      allocation.allocatedAt = now.toISOString();
      allocation.slaStartAt = now.toISOString();
      allocation.slaDeadline = slaDeadlineDate.toISOString();
      allocation.slaStatus = "ACTIVE";
      allocation.status = "ALLOCATED";
      await allocation.save();
    } else {
      allocation = await AllocationModel.create({
        opportunityId,
        studentId,
        allocatedBy,
        allocatedAt: now.toISOString(),
        status: "ALLOCATED",
        slaStartAt: now.toISOString(),
        slaDeadline: slaDeadlineDate.toISOString(),
        slaStatus: "ACTIVE",
      });
    }

    // Update opportunity status
    opp.status = "ALLOCATED";
    opp.allocatedStudentId = studentId;
    await opp.save();

    return stripMongoFields<Allocation>(allocation.toObject());
  }

  // Fallback memory allocation
  const alloc = mockAllocate(opportunityId, studentId, allocatedBy);
  const bid = mockBids.find((b) => b.opportunityId === opportunityId && b.studentId === studentId);
  if (bid) {
    bid.status = "ALLOCATED";
  }
  return alloc;
}

function stripMongoFields<T>(obj: any): T {
  if (!obj) return obj as T;
  const { _id, __v, ...rest } = obj;
  return rest as T;
}
