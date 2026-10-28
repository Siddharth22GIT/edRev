import type { Request, Response } from "express";
import {
  createProposalService,
  getAcademicSnapshotService,
  getAnalyticsService,
  getDashboardMetricsService,
  getProposalsService,
  getSettingsService,
  updateSettingsService,
} from "../services/analytics.service.js";
import type { SettingsSummary } from "@edurev/types";
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

function isValidTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Admin-only: update institution-wide settings. Unknown fields are ignored. */
export async function updateSettingsHandler(req: Request, res: Response): Promise<void> {
  const body = req.body ?? {};
  const update: Partial<SettingsSummary> = {};

  if (body.organizationName !== undefined) {
    const name = typeof body.organizationName === "string" ? body.organizationName.trim() : "";
    if (name.length < 2 || name.length > 80) {
      errorResponse(res, "Organisation name must be 2 to 80 characters.");
      return;
    }
    update.organizationName = name;
  }
  if (body.notificationEmail !== undefined) {
    const email = typeof body.notificationEmail === "string" ? body.notificationEmail.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
      errorResponse(res, "Notification email must be a valid email address.");
      return;
    }
    update.notificationEmail = email;
  }
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== "string" || !isValidTimezone(body.timezone)) {
      errorResponse(res, "Timezone must be a valid IANA timezone, e.g. Asia/Kolkata.");
      return;
    }
    update.timezone = body.timezone;
  }
  if (body.weeklyDigestEnabled !== undefined) {
    if (typeof body.weeklyDigestEnabled !== "boolean") {
      errorResponse(res, "weeklyDigestEnabled must be true or false.");
      return;
    }
    update.weeklyDigestEnabled = body.weeklyDigestEnabled;
  }

  if (body.signupEnabled !== undefined) {
    if (typeof body.signupEnabled !== "boolean") {
      errorResponse(res, "signupEnabled must be true or false.");
      return;
    }
    update.signupEnabled = body.signupEnabled;
  }
  if (body.allowedSignupDomains !== undefined) {
    const domains = Array.isArray(body.allowedSignupDomains)
      ? Array.from(new Set(body.allowedSignupDomains.map((d: unknown) => (typeof d === "string" ? d.trim().toLowerCase().replace(/^@/, "") : ""))))
      : [];
    if (domains.length < 1 || domains.length > 5 || domains.some((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d as string))) {
      errorResponse(res, "Allowed sign-up domains must be 1 to 5 domains like lpu.in.");
      return;
    }
    update.allowedSignupDomains = domains as string[];
  }

  if (Object.keys(update).length === 0) {
    errorResponse(res, "Nothing to update. Editable fields: organizationName, notificationEmail, timezone, weeklyDigestEnabled, signupEnabled, allowedSignupDomains.");
    return;
  }

  try {
    const data = await updateSettingsService(update);
    res.json({ data, message: "Institutional settings saved." });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to save settings.", 500);
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
