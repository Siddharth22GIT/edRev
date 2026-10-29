import type { Request, Response } from "express";
import {
  allocateOpportunityService,
  createOpportunityService,
  getAllocationForOpportunityService,
  getBidProposalDocumentService,
  getBidsForOpportunityService,
  getOpportunitiesService,
  getOpportunityByIdService,
  submitBidService,
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
    const { title, project, company, client, category, budget, deadline, deliverables, description, skills, requiredTier } = req.body;
    if (!project && !title) {
      errorResponse(res, "Opportunity project name/title is required.");
      return;
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

  // S3: the browser checks the file too, but only this check counts
  const pdfProblem = proposalPdfProblem(proposalPdfUrl);
  if (pdfProblem) {
    errorResponse(res, pdfProblem);
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
      proposalPdfUrl,
      proposalPdfName,
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
