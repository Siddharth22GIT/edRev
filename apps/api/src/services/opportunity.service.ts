import { randomUUID } from "node:crypto";
import { can, milestonesFrom, tierRankOf, TIER_INFO, type Allocation, type Bid, type Opportunity, type Student, type Tier, type User } from "@edurev/types";
import {
  allocations as mockAllocations,
  bids as mockBids,
  getBids as mockGetBids,
  getOpportunity as mockGetOpportunity,
  opportunities as mockOpportunities,
  students as mockStudents,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AllocationModel, BidModel, OpportunityModel, StudentModel } from "../models/index.js";
import { deadlineInstant, getInstitutionTimeZone } from "../utils/time.js";
import { sendMessageService } from "./messages.service.js";
import { checkSafeguardsService } from "./safeguard.service.js";
import { logSlaEvent } from "./sla.service.js";

/**
 * U11: records saved before Phase 2 may carry stray spaces in their names ("Hcl Amplified "). New records are
 * trimmed on create; older ones are tidied here when read, so every screen shows the clean name. Returns a copy.
 */
function tidyNames(opp: Opportunity): Opportunity {
  const tidy = (value: string | undefined) => (typeof value === "string" ? value.trim() : value);
  return { ...opp, title: tidy(opp.title)!, project: tidy(opp.project)!, company: tidy(opp.company)!, client: tidy(opp.client)! };
}

export async function getOpportunitiesService(): Promise<Opportunity[]> {
  if (isDbConnected()) {
    const opps = await OpportunityModel.find().lean();
    return opps.map((item) => tidyNames(stripMongoFields<Opportunity>(item)));
  }
  return mockOpportunities.map(tidyNames);
}

export async function getOpportunityByIdService(id: string): Promise<Opportunity | null> {
  if (isDbConnected()) {
    const opp = await OpportunityModel.findOne({ id }).lean();
    return opp ? tidyNames(stripMongoFields<Opportunity>(opp)) : null;
  }
  const mock = mockGetOpportunity(id);
  return mock ? tidyNames(mock) : null;
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

/** Text fields are trimmed so stray spaces ("Hcl Amplified ") never reach the UI. */
const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export async function createOpportunityService(input: Partial<Opportunity>): Promise<Opportunity> {
  const oppId = input.id || `opp-${Date.now()}`;
  const title = clean(input.title) || clean(input.project);
  const company = clean(input.company) || clean(input.client);
  const newOpp: Opportunity = {
    id: oppId,
    title: title || "New Opportunity",
    project: clean(input.project) || title || "New Project",
    description: clean(input.description) || "Client deliverable scope and specifications.",
    client: clean(input.client) || company || "Enterprise Partner",
    company: company || "Client Co.",
    category: clean(input.category) || "Design & Development",
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
    ...(input.bidsCloseAt ? { bidsCloseAt: input.bidsCloseAt } : {}),
  };

  if (isDbConnected()) {
    const created = await OpportunityModel.create(newOpp);
    return stripMongoFields<Opportunity>(created.toObject());
  }

  mockOpportunities.unshift(newOpp);
  return newOpp;
}

/* ------------------------------------------------------------------------------------------------
 * Bids and allocation (Phase 2). Rules, flow and edge cases: docs/modules/bids-and-allocation.md
 * ---------------------------------------------------------------------------------------------- */

type Actor = Pick<User, "id" | "name" | "role"> & Partial<Pick<User, "email" | "studentId">>;

function httpError(message: string, statusCode: number) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** Statuses in which an opportunity accepts bids and can be allocated. */
const OPEN_FOR_BIDS: Opportunity["status"][] = ["OPEN", "UNDER_REVIEW"];
/** Bids still in the running (staff can pick them). */
const ACTIVE_BIDS: Bid["status"][] = ["SUBMITTED", "SHORTLISTED"];

const tierName = (tier: Tier) => `${tier.replace("_", " ")} (${TIER_INFO[tier]?.name ?? tier})`;

async function findOpportunity(id: string): Promise<Opportunity | null> {
  if (isDbConnected()) {
    const opp = await OpportunityModel.findOne({ id }).lean();
    return opp ? stripMongoFields<Opportunity>(opp) : null;
  }
  return mockGetOpportunity(id) ?? null;
}

async function findStudent(id: string): Promise<Student | null> {
  if (isDbConnected()) {
    const student = await StudentModel.findOne({ id }).lean();
    return student ? stripMongoFields<Student>(student) : null;
  }
  return mockStudents.find((s) => s.id === id) ?? null;
}

async function findBid(opportunityId: string, studentId: string): Promise<Bid | null> {
  if (isDbConnected()) {
    const bid = await BidModel.findOne({ opportunityId, studentId }).lean();
    return bid ? stripMongoFields<Bid>(bid) : null;
  }
  return mockBids.find((b) => b.opportunityId === opportunityId && b.studentId === studentId) ?? null;
}

/** E2: why an opportunity no longer takes bids, or null when it does. */
export async function biddingClosedReason(opp: Opportunity, now = new Date()): Promise<string | null> {
  if (opp.status === "ALLOCATED") return "This opportunity has already been allocated to a student.";
  if (!OPEN_FOR_BIDS.includes(opp.status)) return "Bidding is closed for this opportunity.";
  const closesAt = deadlineInstant(opp.bidsCloseAt, await getInstitutionTimeZone());
  if (closesAt && now.getTime() > closesAt.getTime()) return `Bidding closed on ${closesAt.toISOString().slice(0, 10)}.`;
  return null;
}

/** E4: things the student should know about a bid that is still accepted (never a reason to refuse it). */
async function bidWarnings(opp: Opportunity, studentId: string, proposedAmount: number): Promise<string[]> {
  const warnings: string[] = [];
  if (proposedAmount > opp.budget) {
    warnings.push(`Your amount is above the client's budget of ${opp.currency} ${opp.budget.toLocaleString("en-IN")}. Staff will see this.`);
  }
  try {
    const check = await checkSafeguardsService(studentId, opp.id);
    if (!check.eligible) warnings.push(`You can bid, but right now you couldn't be allocated: ${check.reasons.join(" ")}`);
  } catch {
    // Missing hour or academic records in demo data: the check runs again, strictly, at allocation
  }
  return warnings;
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

/**
 * Places a bid (or revives the student's own withdrawn bid). Refuses closed or allocated work (E2) and work
 * above the student's official tier (E4). One bid per student per opportunity stays guaranteed by the
 * unique index; the bid count changes with a single atomic `$inc` so simultaneous bids never lose one (E3).
 */
export async function submitBidService(input: SubmitBidInput): Promise<{ bid: Bid; warnings: string[] }> {
  const opp = await findOpportunity(input.opportunityId);
  if (!opp) throw httpError("Opportunity not found.", 404);

  const closed = await biddingClosedReason(opp);
  if (closed) throw httpError(closed, 409);

  const student = await findStudent(input.studentId);
  if (!student) throw httpError("Your student record wasn't found. Please contact your cell coordinator.", 404);
  if (tierRankOf(student.tier) < tierRankOf(opp.requiredTier)) {
    throw httpError(`This opportunity needs ${tierName(opp.requiredTier)} or higher. Your official tier is ${tierName(student.tier)}.`, 403);
  }

  const now = new Date().toISOString();
  const fields = {
    proposedAmount: input.proposedAmount,
    estimatedCompletionTime: input.estimatedCompletionTime,
    message: input.message,
    relevantSkills: input.relevantSkills,
    proposalPdfUrl: input.proposalPdfUrl,
    proposalPdfName: input.proposalPdfName,
  };
  const existing = await findBid(input.opportunityId, input.studentId);
  if (existing && existing.status !== "WITHDRAWN") throw httpError("You have already submitted a bid for this opportunity.", 409);

  let bid: Bid;
  if (isDbConnected()) {
    if (existing) {
      // E5: bidding again after withdrawing reuses the same record (the unique index allows only one)
      const revived = await BidModel.findOneAndUpdate(
        { opportunityId: input.opportunityId, studentId: input.studentId, status: "WITHDRAWN" },
        { $set: { ...fields, status: "SUBMITTED", editedAt: now }, $unset: { withdrawnAt: 1 } },
        { new: true }
      ).lean();
      if (!revived) throw httpError("You have already submitted a bid for this opportunity.", 409);
      bid = stripMongoFields<Bid>(revived);
    } else {
      try {
        const created = await BidModel.create({ id: `bid-${randomUUID()}`, opportunityId: input.opportunityId, studentId: input.studentId, ...fields, status: "SUBMITTED", createdAt: now });
        bid = stripMongoFields<Bid>(created.toObject());
      } catch (error: any) {
        // Only the (opportunity, student) index means "already bid"; anything else is a real error
        if (error?.code === 11000 && error?.keyPattern?.opportunityId) throw httpError("You have already submitted a bid for this opportunity.", 409);
        throw error;
      }
    }
    await OpportunityModel.updateOne({ id: opp.id }, { $inc: { numberOfBids: 1 } });
    // Only OPEN moves forward to UNDER_REVIEW; a bid never moves an opportunity backwards
    await OpportunityModel.updateOne({ id: opp.id, status: "OPEN" }, { $set: { status: "UNDER_REVIEW", updatedAt: now } });
  } else {
    if (existing) {
      Object.assign(existing, fields, { status: "SUBMITTED", editedAt: now });
      delete existing.withdrawnAt;
      bid = existing;
    } else {
      bid = { id: `bid-${randomUUID()}`, opportunityId: input.opportunityId, studentId: input.studentId, ...fields, status: "SUBMITTED", createdAt: now };
      mockBids.push(bid);
    }
    const mockOpp = mockGetOpportunity(opp.id);
    if (mockOpp) {
      mockOpp.numberOfBids = (mockOpp.numberOfBids || 0) + 1;
      if (mockOpp.status === "OPEN") mockOpp.status = "UNDER_REVIEW";
    }
  }

  return { bid, warnings: await bidWarnings(opp, input.studentId, input.proposedAmount) };
}

export type BidChanges = Partial<Pick<Bid, "proposedAmount" | "estimatedCompletionTime" | "message" | "relevantSkills" | "proposalPdfUrl" | "proposalPdfName">> & { removeProposal?: boolean };

/** E5: the student edits their own bid while it's still SUBMITTED and bidding is open. */
export async function updateMyBidService(opportunityId: string, studentId: string, changes: BidChanges): Promise<{ bid: Bid; warnings: string[] }> {
  const opp = await findOpportunity(opportunityId);
  if (!opp) throw httpError("Opportunity not found.", 404);
  const existing = await findBid(opportunityId, studentId);
  if (!existing) throw httpError("You haven't bid on this opportunity.", 404);
  if (existing.status !== "SUBMITTED") throw httpError(`Your bid is ${existing.status.toLowerCase()} and can't be edited.`, 409);
  const closed = await biddingClosedReason(opp);
  if (closed) throw httpError(closed, 409);

  const { removeProposal, ...rest } = changes;
  const set: Record<string, unknown> = { editedAt: new Date().toISOString() };
  for (const [key, value] of Object.entries(rest)) if (value !== undefined) set[key] = value;

  let bid: Bid;
  if (isDbConnected()) {
    const update: Record<string, unknown> = { $set: set };
    if (removeProposal) update.$unset = { proposalPdfUrl: 1, proposalPdfName: 1 };
    // Atomic: if staff allocated or the student withdrew meanwhile, nothing matches → 409
    const saved = await BidModel.findOneAndUpdate({ opportunityId, studentId, status: "SUBMITTED" }, update, { new: true }).lean();
    if (!saved) throw httpError("Your bid changed in the meantime. Refresh and try again.", 409);
    bid = stripMongoFields<Bid>(saved);
  } else {
    Object.assign(existing, set);
    if (removeProposal) {
      delete existing.proposalPdfUrl;
      delete existing.proposalPdfName;
    }
    bid = existing;
  }
  return { bid, warnings: await bidWarnings(opp, studentId, bid.proposedAmount) };
}

/** E5: the student withdraws their own bid. Allowed until it is allocated or rejected. */
export async function withdrawMyBidService(opportunityId: string, studentId: string): Promise<Bid> {
  const existing = await findBid(opportunityId, studentId);
  if (!existing) throw httpError("You haven't bid on this opportunity.", 404);
  if (existing.status === "ALLOCATED") throw httpError("This work was already allocated to you. Ask your cell coordinator if you can't do it.", 409);
  if (!ACTIVE_BIDS.includes(existing.status)) throw httpError(`Your bid is already ${existing.status.toLowerCase()}.`, 409);

  const now = new Date().toISOString();
  if (isDbConnected()) {
    const saved = await BidModel.findOneAndUpdate(
      { opportunityId, studentId, status: { $in: ACTIVE_BIDS } },
      { $set: { status: "WITHDRAWN", withdrawnAt: now } },
      { new: true }
    ).lean();
    if (!saved) throw httpError("Your bid changed in the meantime. Refresh and try again.", 409);
    await OpportunityModel.updateOne({ id: opportunityId, numberOfBids: { $gt: 0 } }, { $inc: { numberOfBids: -1 } });
    // With no bids left in the running, the opportunity is simply open again
    if ((await BidModel.countDocuments({ opportunityId, status: { $in: ACTIVE_BIDS } })) === 0) {
      await OpportunityModel.updateOne({ id: opportunityId, status: "UNDER_REVIEW" }, { $set: { status: "OPEN", updatedAt: now } });
    }
    return stripMongoFields<Bid>(saved);
  }

  Object.assign(existing, { status: "WITHDRAWN", withdrawnAt: now });
  const mockOpp = mockGetOpportunity(opportunityId);
  if (mockOpp) {
    mockOpp.numberOfBids = Math.max(0, (mockOpp.numberOfBids || 0) - 1);
    const stillActive = mockBids.some((b) => b.opportunityId === opportunityId && ACTIVE_BIDS.includes(b.status));
    if (!stillActive && mockOpp.status === "UNDER_REVIEW") mockOpp.status = "OPEN";
  }
  return existing;
}

/**
 * E7 / D6: the delivery deadline the student commits to, fixed at allocation and never in the past.
 * Staff may choose one; otherwise the client's due date if it's still ahead; otherwise 7 days from now.
 */
async function agreedDeadline(opp: Opportunity, requested: string | undefined, now: Date): Promise<Date> {
  const tz = await getInstitutionTimeZone();
  if (requested) {
    const chosen = deadlineInstant(requested, tz);
    if (!chosen) throw httpError("slaDeadline must be a valid date.", 400);
    if (chosen.getTime() <= now.getTime()) throw httpError("The delivery deadline must be in the future.", 400);
    return chosen;
  }
  for (const candidate of [opp.deadline, opp.slaDeadline]) {
    const due = deadlineInstant(candidate, tz);
    if (due && due.getTime() > now.getTime()) return due;
  }
  return new Date(now.getTime() + 7 * 86400000);
}

/** Who the work may go to: a student with a live bid, or (D7) anyone if the actor may assign directly with a reason. */
async function assertMayReceiveWork(opportunityId: string, studentId: string, actor: Actor, reason: string | undefined, allowRejectedBid: boolean) {
  const bid = await findBid(opportunityId, studentId);
  const usable = bid && (ACTIVE_BIDS.includes(bid.status) || (allowRejectedBid && bid.status === "REJECTED"));
  if (usable) return { bid, direct: false };
  if (!can(actor.role, "ALLOCATION_DIRECT_ASSIGN")) {
    if (bid?.status === "WITHDRAWN") throw httpError("This student withdrew their bid.", 409);
    throw httpError("This student hasn't bid on this opportunity. Only an Administrator can assign work directly.", 400);
  }
  if (!reason || reason.trim().length < 5) throw httpError("Assigning a student who didn't bid needs a reason (at least 5 characters).", 400);
  return { bid, direct: true };
}

/** Best effort: tells students about a decision on their bid. A failed message never undoes the decision. */
async function notifyStudents(actor: Actor, studentIds: string[], subject: string, body: string): Promise<void> {
  if (studentIds.length === 0) return;
  try {
    await sendMessageService(actor as User, { audience: { type: "STUDENTS", studentIds }, subject: subject.slice(0, 120), body, priority: "NORMAL", allowReplies: true });
  } catch (error) {
    console.warn(`[bids] could not notify ${studentIds.join(", ")}: ${(error as Error).message}`);
  }
}

export interface AllocateOptions {
  /** D7: required when an Administrator assigns a student who didn't bid. */
  reason?: string;
  /** E7: optional delivery deadline chosen by staff (must be in the future). */
  slaDeadline?: string;
}

/**
 * Allocates an opportunity to one student (E1). The opportunity is *claimed* in a single conditional update
 * (only if it is still OPEN or UNDER_REVIEW), so two staff allocating at once can't both win: the second gets
 * 409. Bids change only after the claim succeeds. Other bids become REJECTED and those students get a message (E5).
 */
export async function allocateOpportunityService(opportunityId: string, studentId: string, allocatedBy: string | Actor, options: AllocateOptions = {}): Promise<Allocation> {
  const actor: Actor = typeof allocatedBy === "string" ? { id: allocatedBy, name: allocatedBy, role: "BID_DESK_ANALYST" } : allocatedBy;
  const opp = await findOpportunity(opportunityId);
  if (!opp) throw httpError("Opportunity not found.", 404);
  if (!OPEN_FOR_BIDS.includes(opp.status)) {
    throw httpError(opp.status === "ALLOCATED" ? "This opportunity is already allocated. Use Reassign to change the student." : "This opportunity is closed.", 409);
  }
  if (!(await findStudent(studentId))) throw httpError("Student not found.", 404);
  const { direct } = await assertMayReceiveWork(opportunityId, studentId, actor, options.reason, false);

  // Academic and hour safeguards (unchanged rules)
  const check = await checkSafeguardsService(studentId, opportunityId);
  if (!check.eligible) throw httpError(`Allocation blocked: ${check.reasons.join(". ")}`, 400);

  const now = new Date();
  const deadline = await agreedDeadline(opp, options.slaDeadline, now);
  const record: Allocation = {
    opportunityId,
    studentId,
    allocatedBy: actor.name,
    allocatedAt: now.toISOString(),
    status: "ALLOCATED",
    slaStartAt: now.toISOString(),
    slaDeadline: deadline.toISOString(),
    slaStatus: "ACTIVE",
    ...(direct ? { directAssignmentReason: options.reason!.trim() } : {}),
    // Phase 4 (F2a): one milestone per deliverable; the original deadline is kept when extensions move it
    milestones: milestonesFrom(opp.deliverables),
    originalSlaDeadline: deadline.toISOString(),
  };

  let rejected: string[];
  if (isDbConnected()) {
    // 1. Claim: succeeds for exactly one request
    const claimed = await OpportunityModel.findOneAndUpdate(
      { id: opportunityId, status: { $in: OPEN_FOR_BIDS } },
      { $set: { status: "ALLOCATED", allocatedStudentId: studentId, updatedAt: now.toISOString() } },
      { new: false }
    ).lean<Opportunity>();
    if (!claimed) throw httpError("Someone else allocated this opportunity a moment ago. Refresh to see who.", 409);
    const undoClaim = () => OpportunityModel.updateOne({ id: opportunityId }, { $set: { status: claimed.status }, $unset: { allocatedStudentId: 1 } });

    // 2. The allocation record (unique per opportunity). A cancelled one may be reused.
    try {
      const previous = await AllocationModel.findOne({ opportunityId }).lean<Allocation>();
      if (previous && previous.status !== "CANCELLED") {
        await undoClaim();
        throw httpError("This opportunity already has an active allocation.", 409);
      }
      if (previous) await AllocationModel.replaceOne({ opportunityId }, record);
      else await AllocationModel.create(record);
    } catch (error: any) {
      if (error?.statusCode) throw error;
      await undoClaim();
      if (error?.code === 11000) throw httpError("Someone else allocated this opportunity a moment ago. Refresh to see who.", 409);
      throw error;
    }

    // 3. Bids: the chosen one is ALLOCATED, every other live bid is REJECTED
    await BidModel.updateOne({ opportunityId, studentId }, { $set: { status: "ALLOCATED" } });
    const losers = await BidModel.find({ opportunityId, studentId: { $ne: studentId }, status: { $in: ACTIVE_BIDS } }, { studentId: 1 }).lean<{ studentId: string }[]>();
    rejected = losers.map((b) => b.studentId);
    if (rejected.length) await BidModel.updateMany({ opportunityId, studentId: { $in: rejected }, status: { $in: ACTIVE_BIDS } }, { $set: { status: "REJECTED" } });
  } else {
    // Demo data: single-threaded, so check-and-set is already atomic
    const mockOpp = mockGetOpportunity(opportunityId)!;
    if (!OPEN_FOR_BIDS.includes(mockOpp.status)) throw httpError("Someone else allocated this opportunity a moment ago. Refresh to see who.", 409);
    const existingIndex = mockAllocations.findIndex((a) => a.opportunityId === opportunityId);
    if (existingIndex >= 0 && mockAllocations[existingIndex].status !== "CANCELLED") throw httpError("This opportunity already has an active allocation.", 409);
    mockOpp.status = "ALLOCATED";
    mockOpp.allocatedStudentId = studentId;
    if (existingIndex >= 0) mockAllocations[existingIndex] = record;
    else mockAllocations.push(record);
    rejected = [];
    for (const b of mockBids.filter((x) => x.opportunityId === opportunityId)) {
      if (b.studentId === studentId) b.status = "ALLOCATED";
      else if (ACTIVE_BIDS.includes(b.status)) {
        b.status = "REJECTED";
        rejected.push(b.studentId);
      }
    }
  }

  await recordSlaEvent({ opportunityId, studentId, type: "ALLOCATED", by: actor.name, note: direct ? `Direct assignment: ${options.reason!.trim()}` : undefined });
  await notifyStudents(
    actor,
    rejected,
    `Bid update: ${opp.title}`,
    `Thank you for bidding on "${opp.title}". This time the work was allocated to another student. Your bid is now closed; keep an eye on new opportunities for your tier.`
  );
  return record;
}

/**
 * E1b: moves allocated work that isn't delivered yet to another student, with a recorded reason.
 * Atomic on the current student, so two reassignments at once can't both apply.
 */
export async function reassignAllocationService(opportunityId: string, toStudentId: string, actor: Actor, reason: string, options: { slaDeadline?: string } = {}): Promise<Allocation> {
  if (!reason || reason.trim().length < 5) throw httpError("A reason is required (at least 5 characters).", 400);
  const opp = await findOpportunity(opportunityId);
  if (!opp) throw httpError("Opportunity not found.", 404);
  const current = await getAllocationForOpportunityService(opportunityId);
  if (!current) throw httpError("This opportunity hasn't been allocated yet.", 404);
  if (current.status === "COMPLETED") throw httpError("This work was already delivered and can't be reassigned.", 409);
  if (current.status === "CANCELLED") throw httpError("This allocation was cancelled.", 409);
  // Copied now: in demo data `current` is the live record that gets updated below
  const fromStudentId = current.studentId;
  if (fromStudentId === toStudentId) throw httpError("The work is already allocated to this student.", 400);
  if (!(await findStudent(toStudentId))) throw httpError("Student not found.", 404);
  await assertMayReceiveWork(opportunityId, toStudentId, actor, reason, true);

  const check = await checkSafeguardsService(toStudentId, opportunityId);
  if (!check.eligible) throw httpError(`Reassignment blocked: ${check.reasons.join(". ")}`, 400);

  const now = new Date();
  const deadline = await agreedDeadline(opp, options.slaDeadline, now);
  const entry = { fromStudentId, toStudentId, by: actor.name, at: now.toISOString(), reason: reason.trim() };
  const changes = { studentId: toStudentId, allocatedBy: actor.name, allocatedAt: now.toISOString(), status: "ALLOCATED" as const, slaStartAt: now.toISOString(), slaDeadline: deadline.toISOString(), slaStatus: "ACTIVE" as const, milestones: milestonesFrom(opp.deliverables), originalSlaDeadline: deadline.toISOString() };
  // Phase 4: the new student starts fresh (the previous student's progress stays on the timeline, G12)
  const fresh = ["kickoffAt", "submissions", "extensions", "pauses", "handBack", "lastHoursAt"] as const;

  let saved: Allocation;
  if (isDbConnected()) {
    const updated = await AllocationModel.findOneAndUpdate(
      { opportunityId, studentId: fromStudentId, status: { $nin: ["COMPLETED", "CANCELLED"] } },
      { $set: changes, $push: { reassignments: entry }, $unset: Object.fromEntries(fresh.map((f) => [f, 1])) },
      { new: true }
    ).lean();
    if (!updated) throw httpError("The allocation changed in the meantime. Refresh and try again.", 409);
    saved = stripMongoFields<Allocation>(updated);
    await OpportunityModel.updateOne({ id: opportunityId }, { $set: { allocatedStudentId: toStudentId, updatedAt: now.toISOString() } });
    await BidModel.updateOne({ opportunityId, studentId: fromStudentId }, { $set: { status: "REJECTED" } });
    await BidModel.updateOne({ opportunityId, studentId: toStudentId }, { $set: { status: "ALLOCATED" } });
  } else {
    const record = mockAllocations.find((a) => a.opportunityId === opportunityId)!;
    Object.assign(record, changes, { reassignments: [...(record.reassignments ?? []), entry] });
    for (const f of fresh) delete record[f];
    saved = record;
    const mockOpp = mockGetOpportunity(opportunityId);
    if (mockOpp) mockOpp.allocatedStudentId = toStudentId;
    for (const b of mockBids.filter((x) => x.opportunityId === opportunityId)) {
      if (b.studentId === fromStudentId) b.status = "REJECTED";
      if (b.studentId === toStudentId) b.status = "ALLOCATED";
    }
  }

  await recordSlaEvent({ opportunityId, studentId: toStudentId, type: "REASSIGNED", by: actor.name, note: `From ${fromStudentId}: ${reason.trim()}` });
  await notifyStudents(
    actor,
    [fromStudentId],
    `Allocation update: ${opp.title}`,
    `The work "${opp.title}" has been moved to another student by ${actor.name}. If you have questions, reply to this message.`
  );
  return saved;
}

/** Best effort: the timeline never blocks an allocation. */
async function recordSlaEvent(event: Parameters<typeof logSlaEvent>[0]): Promise<void> {
  try {
    await logSlaEvent(event);
  } catch (error) {
    console.warn(`[bids] could not log ${event.type}: ${(error as Error).message}`);
  }
}

function stripMongoFields<T>(obj: any): T {
  if (!obj) return obj as T;
  const { _id, __v, ...rest } = obj;
  return rest as T;
}
