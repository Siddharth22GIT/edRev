import type { Request, Response } from "express";
import {
  allocateOpportunityService,
  createOpportunityService,
  getAllocationForOpportunityService,
  getBidProposalDocumentService,
  getBidsForOpportunityService,
  getOpportunitiesService,
  getOpportunityByIdService,
  reassignAllocationService,
  submitBidService,
  updateMyBidService,
  withdrawMyBidService,
  type BidChanges,
} from "../services/opportunity.service.js";
import { can } from "@edurev/types";
import { ownStudentId } from "../middleware/auth.middleware.js";
import { proposalPdfProblem } from "../utils/uploads.js";

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
    // Reviewers see every bid; a student only sees their own bid on the opportunity
    const visible = can(req.user?.role, "BID_REVIEW") ? bids : bids.filter((b) => b.studentId === ownStudentId(req.user));
    res.json({ data: visible });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch bids.", 500);
  }
}

export async function getBidProposalDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const opportunityId = getParam(req.params.id);
    const bidId = getParam(req.params.bidId);

    const doc = await getBidProposalDocumentService(opportunityId, bidId);
    if (!doc) {
      errorResponse(res, "Proposal document not found.", 404);
      return;
    }
    if (!can(req.user?.role, "BID_REVIEW") && doc.studentId !== ownStudentId(req.user)) {
      errorResponse(res, "Forbidden: You can only access your own proposal documents.", 403);
      return;
    }

    // S3: the type comes from the file's real bytes, never from what the uploader declared. Only real PDFs
    // may open in the browser; anything else is a plain download, so uploaded HTML/SVG can never run.
    const mimeType = doc.isPdf
      ? "application/pdf"
      : doc.isDocx
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/octet-stream";
    const disposition = doc.isPdf && req.query.disposition === "inline" ? "inline" : "attachment";
    // Header-safe name: no control characters; an ASCII fallback plus the exact UTF-8 name
    const safeName = doc.filename.replace(/[\x00-\x1f\x7f]/g, "_");
    const asciiName = safeName.replace(/[^\x20-\x7e]/g, "_");
    const encodedFilename = encodeURIComponent(safeName);

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", doc.buffer.length);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedFilename}`
    );
    res.send(doc.buffer);
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to retrieve proposal document.", 500);
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

export async function createOpportunityHandler(req: Request, res: Response): Promise<void> {
  try {
    const { title, project, company, client, category, budget, deadline, deliverables, description, skills, requiredTier, bidsCloseAt } = req.body;
    if (!project && !title) {
      errorResponse(res, "Opportunity project name/title is required.");
      return;
    }
    // E2: optional moment bidding closes (a date or date-time in the future)
    if (bidsCloseAt !== undefined && bidsCloseAt !== null && bidsCloseAt !== "") {
      const closes = new Date(bidsCloseAt);
      if (typeof bidsCloseAt !== "string" || Number.isNaN(closes.getTime())) {
        errorResponse(res, "bidsCloseAt must be a valid date.");
        return;
      }
    }
    const data = await createOpportunityService({
      title: title || project,
      project: project || title,
      company: company || client || "Partner Company",
      client: client || company || "Partner Company",
      category: category || "Development",
      budget: Number(budget) || 10000,
      deadline: deadline || new Date(Date.now() + 14 * 86400000).toISOString(),
      deliverables: Array.isArray(deliverables) ? deliverables : typeof deliverables === "string" ? deliverables.split(",").map((s) => s.trim()).filter(Boolean) : ["Deliverable 1"],
      description: description || "Project scope and deliverables.",
      skills: Array.isArray(skills) ? skills : typeof skills === "string" ? skills.split(",").map((s) => s.trim()).filter(Boolean) : ["General"],
      requiredTier: requiredTier || "TIER_1",
      ...(typeof bidsCloseAt === "string" && bidsCloseAt ? { bidsCloseAt } : {}),
    });
    res.status(201).json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to create opportunity.", 500);
  }
}

export async function submitBidHandler(req: Request, res: Response): Promise<void> {
  const { proposedAmount, estimatedCompletionTime, message, relevantSkills, proposalPdfUrl, proposalPdfName } = req.body;
  const opportunityId = getParam(req.params.id);

  // Authenticated student identity enforcement (Do NOT trust frontend body studentId override)
  const studentId = req.user?.studentId || req.user?.id;

  if (!studentId) {
    errorResponse(res, "Authenticated student identity missing.", 401);
    return;
  }

  if (!proposedAmount || !estimatedCompletionTime || !message || !relevantSkills) {
    errorResponse(res, "All bid fields are required.");
    return;
  }

  // E4: shapes and sizes (the service checks tier, bidding window and safeguards)
  const parsed = parseBidChanges(req.body);
  if ("error" in parsed) {
    errorResponse(res, parsed.error);
    return;
  }

  // S3: the browser checks the file too, but only this check counts
  const pdfProblem = proposalPdfProblem(proposalPdfUrl);
  if (pdfProblem) {
    errorResponse(res, pdfProblem);
    return;
  }

  try {
    const { bid, warnings } = await submitBidService({
      opportunityId,
      studentId,
      proposedAmount: parsed.changes.proposedAmount!,
      estimatedCompletionTime: parsed.changes.estimatedCompletionTime!,
      message: parsed.changes.message!,
      relevantSkills: parsed.changes.relevantSkills!,
      proposalPdfUrl,
      proposalPdfName: parsed.changes.proposalPdfName,
    });
    // `warnings` (additive): things the student should know, e.g. above budget or currently blocked by a safeguard
    res.status(201).json({ data: bid, warnings });
  } catch (err: any) {
    const status = err.statusCode || (err.message?.includes("already submitted") ? 409 : 400);
    errorResponse(res, err.message || "Unable to submit bid.", status);
  }
}

export async function allocateOpportunityHandler(req: Request, res: Response): Promise<void> {
  const { studentId, reason, slaDeadline } = req.body ?? {};
  const opportunityId = getParam(req.params.id);
  const user = req.user!;
  // Who allocated comes from the token, never from the request body
  const actor = { id: user.id, name: user.name || user.role, role: user.role, email: user.email };

  if (!studentId || typeof studentId !== "string") {
    errorResponse(res, "studentId is required.");
    return;
  }
  if ((reason !== undefined && typeof reason !== "string") || (slaDeadline !== undefined && typeof slaDeadline !== "string")) {
    errorResponse(res, "reason and slaDeadline must be text.");
    return;
  }

  try {
    const allocation = await allocateOpportunityService(opportunityId, studentId, actor, { reason: reason?.slice(0, 500), slaDeadline });
    res.json({ data: allocation });
  } catch (err: any) {
    const status = err.statusCode || 400;
    errorResponse(res, err.message || "Unable to allocate.", status);
  }
}

const MAX_MESSAGE = 2000;

/**
 * E4: validates bid fields that are present (all of them when placing a bid, any of them when editing).
 * Returns the cleaned values or an error message.
 */
function parseBidChanges(body: any): { changes: BidChanges } | { error: string } {
  const changes: BidChanges = {};
  if (body.proposedAmount !== undefined) {
    const amount = Number(body.proposedAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return { error: "The proposed amount must be a positive number." };
    changes.proposedAmount = Math.round(amount * 100) / 100;
  }
  const text: [keyof BidChanges, string, number][] = [
    ["estimatedCompletionTime", "Estimated delivery time", 60],
    ["message", "The cover message", MAX_MESSAGE],
    ["relevantSkills", "Relevant skills", 500],
    ["proposalPdfName", "The proposal file name", 200],
  ];
  for (const [key, label, max] of text) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || !value.trim()) return { error: `${label} must be text.` };
    if (value.trim().length > max) return { error: `${label} must be at most ${max} characters.` };
    (changes as any)[key] = value.trim();
  }
  return { changes };
}

/** E5: the signed-in student edits their own bid (only while it's SUBMITTED and bidding is open). */
export async function updateMyBidHandler(req: Request, res: Response): Promise<void> {
  const studentId = ownStudentId(req.user);
  if (!studentId) return void errorResponse(res, "Only students have bids to edit.", 403);

  const parsed = parseBidChanges(req.body ?? {});
  if ("error" in parsed) return void errorResponse(res, parsed.error);
  const { proposalPdfUrl, removeProposal } = req.body ?? {};
  const pdfProblem = proposalPdfProblem(proposalPdfUrl);
  if (pdfProblem) return void errorResponse(res, pdfProblem);

  const changes: BidChanges = { ...parsed.changes, ...(proposalPdfUrl ? { proposalPdfUrl } : {}), ...(removeProposal === true ? { removeProposal: true } : {}) };
  if (Object.keys(changes).length === 0) return void errorResponse(res, "Nothing to update.");

  try {
    const { bid, warnings } = await updateMyBidService(getParam(req.params.id), studentId, changes);
    res.json({ data: bid, warnings });
  } catch (err: any) {
    errorResponse(res, err.message || "Unable to update your bid.", err.statusCode || 400);
  }
}

/** E5: the signed-in student withdraws their own bid. */
export async function withdrawMyBidHandler(req: Request, res: Response): Promise<void> {
  const studentId = ownStudentId(req.user);
  if (!studentId) return void errorResponse(res, "Only students have bids to withdraw.", 403);
  try {
    const bid = await withdrawMyBidService(getParam(req.params.id), studentId);
    res.json({ data: bid });
  } catch (err: any) {
    errorResponse(res, err.message || "Unable to withdraw your bid.", err.statusCode || 400);
  }
}

/** E1b: move allocated (not yet delivered) work to another student, with a reason. */
export async function reassignAllocationHandler(req: Request, res: Response): Promise<void> {
  const { studentId, reason, slaDeadline } = req.body ?? {};
  if (!studentId || typeof studentId !== "string") return void errorResponse(res, "studentId is required.");
  if (typeof reason !== "string") return void errorResponse(res, "A reason is required (at least 5 characters).");
  if (slaDeadline !== undefined && typeof slaDeadline !== "string") return void errorResponse(res, "slaDeadline must be a date.");
  const user = req.user!;
  try {
    const allocation = await reassignAllocationService(
      getParam(req.params.id),
      studentId,
      { id: user.id, name: user.name || user.role, role: user.role, email: user.email },
      reason.slice(0, 500),
      { slaDeadline }
    );
    res.json({ data: allocation });
  } catch (err: any) {
    errorResponse(res, err.message || "Unable to reassign.", err.statusCode || 400);
  }
}
