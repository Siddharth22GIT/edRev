import type { Request, Response } from "express";
import {
  createProposalService,
  getAcademicSnapshotService,
  getAnalyticsService,
  getDashboardMetricsService,
  getProposalsService,
  getSettingsService,
} from "../services/analytics.service.js";
import { getOpportunitiesService } from "../services/opportunity.service.js";

const errorResponse = (res: Response, message: string, status = 400) =>
  res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || "";

export async function getDashboardHandler(_req: Request, res: Response): Promise<void> {
  try {
    const metrics = await getDashboardMetricsService();
    const allOpps = await getOpportunitiesService();
    const analytics = await getAnalyticsService();
    res.json({
      metrics,
      recentOpportunities: allOpps.slice(0, 3),
      weeklyActivity: analytics.weeklyActivity,
    });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch dashboard metrics.", 500);
  }
}

export async function getAnalyticsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getAnalyticsService();
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch analytics.", 500);
  }
}

export async function getProposalsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getProposalsService();
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch proposals.", 500);
  }
}

export async function createProposalHandler(req: Request, res: Response): Promise<void> {
  try {
    const { title, studentName, opportunityId, author, status, value } = req.body;
    if (!title) {
      errorResponse(res, "Proposal title is required.");
      return;
    }
    // Students always submit under their own name; staff may create proposals on a student's behalf
    const isStudent = req.user?.role === "STUDENT";
    const student = isStudent ? req.user!.name : studentName || req.user?.name || "Student Learner";
    const authorName = isStudent ? req.user!.name : author || req.user?.name || req.user?.role || "Student";
    const data = await createProposalService({
      title,
      studentName: student,
      opportunityId: opportunityId || "opp-1024",
      author: authorName,
      status: status || "DRAFT",
      value: Number(value) || 0,
      submittedAt: new Date().toISOString(),
    });
    res.status(201).json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to create proposal.", 500);
  }
}

export async function getSettingsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getSettingsService();
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch settings.", 500);
  }
}

export async function getAcademicSnapshotHandler(req: Request, res: Response): Promise<void> {
  try {
    const studentId = getParam(req.params.studentId);
    const data = await getAcademicSnapshotService(studentId);
    if (!data) {
      errorResponse(res, "Academic snapshot not found.", 404);
      return;
    }
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch academic snapshot.", 500);
  }
}
