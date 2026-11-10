import type { Request, Response } from "express";
import {
  checkSafeguardsService,
  createBlackoutService,
  createOverrideService,
  deleteBlackoutService,
  getBlackoutPeriodsService,
  getHourLogService,
  getSafeguardsService,
  lastDailyRunService,
  listOverridesService,
  overrideHourCapService,
  revokeOverrideService,
  updateComplianceService,
} from "../services/safeguard.service.js";
import { addManualHoursService } from "../services/hours.service.js";
import { getSafeguardLimitsService, updateSafeguardLimitsService } from "../services/limits.service.js";
import { handle } from "./phase4.helpers.js";
import { can } from "@edurev/types";
import { ownStudentId } from "../middleware/auth.middleware.js";

const errorResponse = (res: Response, message: string, status = 400) =>
  res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || "";

export async function getSafeguardsHandler(_req: Request, res: Response): Promise<void> {
  try {
    // G7: worked out now from every active student's record, plus when the daily checks last ran
    const data = await getSafeguardsService();
    res.json({ data, lastDailyRun: await lastDailyRunService() });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch safeguards.", 500);
  }
}

export async function checkSafeguardsHandler(req: Request, res: Response): Promise<void> {
  try {
    const studentId = getParam(req.params.studentId);
    // G6: with ?opportunityId= the check includes that work (tier, its weekly hours, exams inside its dates)
    const opportunityId = typeof req.query.opportunityId === "string" && req.query.opportunityId ? req.query.opportunityId : undefined;
    const data = await checkSafeguardsService(studentId, opportunityId);
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Error checking safeguards.", 500);
  }
}

export async function getHourLogHandler(req: Request, res: Response): Promise<void> {
  try {
    const studentId = getParam(req.params.studentId);
    const log = await getHourLogService(studentId);
    if (!log) {
      errorResponse(res, "Hour log not found.", 404);
      return;
    }
    res.json({ data: log });
  } catch (err: any) {
    errorResponse(res, err.message || "Error fetching hour log.", 500);
  }
}

export async function postHourLogHandler(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    errorResponse(res, "Authentication required.", 401);
    return;
  }

  let studentId: string | undefined;
  if (user.role === "STUDENT") {
    // Students can only log their own hours; never trust a body-supplied studentId
    studentId = ownStudentId(user);
    if (req.body?.studentId && req.body.studentId !== studentId) {
      errorResponse(res, "Forbidden: Students can only log their own hours.", 403);
      return;
    }
  } else {
    if (!can(user.role, "STUDENT_SUPERVISE")) {
      errorResponse(res, `Forbidden: Role '${user.role}' is not authorized to log student hours.`, 403);
      return;
    }
    studentId = req.body?.studentId;
    if (!studentId) {
      errorResponse(res, "studentId is required.");
      return;
    }
  }

  // S12: validate instead of echoing whatever was sent. G2 (Phase 4): the hours are now stored as a typed-in
  // entry for that day; the response keeps its shape and adds the saved `entry`.
  const hours = Number(req.body?.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    errorResponse(res, "hours must be a number greater than 0 and at most 24.");
    return;
  }
  const date = typeof req.body?.date === "string" ? req.body.date.slice(0, 10) : undefined;
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 300) : undefined;
  const opportunityId = typeof req.body?.opportunityId === "string" && req.body.opportunityId ? req.body.opportunityId : undefined;

  try {
    const entry = await addManualHoursService({ studentId: studentId!, hours, date, note, opportunityId, createdBy: user.name });
    res.status(201).json({
      data: { studentId, hours, ...(date ? { date } : {}), ...(note ? { note } : {}) },
      entry,
      note: `Saved ${hours} h for ${entry.date}. It counts toward that week's check-in.`,
    });
  } catch (err: any) {
    errorResponse(res, err.message || "Couldn't save the hours.", err.statusCode || 500);
  }
}

export async function getBlackoutPeriodsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getBlackoutPeriodsService();
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch blackout periods.", 500);
  }
}

export async function overrideHourCapHandler(req: Request, res: Response): Promise<void> {
  // The approver's role and identity come from the verified token, never from the request body
  const user = req.user!;
  const { studentId, reason } = req.body;
  if (!studentId) {
    errorResponse(res, "studentId is required.", 400);
    return;
  }
  if (!reason || !String(reason).trim()) {
    errorResponse(res, "A reason is required to override the hour cap.", 400);
    return;
  }

  try {
    const data = await overrideHourCapService(studentId, user.role, String(reason).trim(), user.id);
    res.json({
      data,
      approvedBy: user.role,
      approverId: user.id,
      timestamp: data.overriddenAt ?? new Date().toISOString(),
    });
  } catch (err: any) {
    const status = err.statusCode || 400;
    errorResponse(res, err.message || "Unable to override hour cap.", status);
  }
}

/* ---------------- Phase 4: limits, overrides, blackouts, compliance (docs/modules/safeguards.md §5) ---------------- */

/** GET /safeguards/limits: everyone signed in may read the limits (they explain the rules). */
export const getLimitsHandler = handle(async (_req, res) => {
  res.json({ data: await getSafeguardLimitsService() });
}, "Failed to load the safeguard limits.");

/** PUT /safeguards/limits (SETTINGS_MANAGE): validated ranges; nonsense limits are refused (G1). */
export const updateLimitsHandler = handle(async (req, res) => {
  res.json({ data: await updateSafeguardLimitsService(req.body ?? {}), message: "Safeguard limits saved." });
}, "Failed to save the safeguard limits.");

export const listOverridesHandler = handle(async (req, res) => {
  res.json({ data: await listOverridesService(getParam(req.params.studentId)) });
}, "Failed to load overrides.");

/** POST /safeguards/overrides { studentId, rule, reason, days } (SAFEGUARD_OVERRIDE). Hard rules refuse with 400. */
export const createOverrideHandler = handle(async (req, res) => {
  const user = req.user!;
  const { studentId, rule, reason, days } = req.body ?? {};
  if (typeof studentId !== "string" || !studentId) {
    res.status(400).json({ message: "studentId is required." });
    return;
  }
  const data = await createOverrideService({ studentId, rule, reason, days }, `${user.name} (${user.role})`);
  res.status(201).json({ data, message: `Override recorded until ${data.expiresAt.slice(0, 10)}.` });
}, "Failed to record the override.");

export const revokeOverrideHandler = handle(async (req, res) => {
  const user = req.user!;
  res.json({ data: await revokeOverrideService(getParam(req.params.id), `${user.name} (${user.role})`), message: "Override ended." });
}, "Failed to end the override.");

export const createBlackoutHandler = handle(async (req, res) => {
  res.status(201).json({ data: await createBlackoutService(req.body ?? {}, req.user!.name), message: "Exam blackout added." });
}, "Failed to add the blackout.");

export const deleteBlackoutHandler = handle(async (req, res) => {
  await deleteBlackoutService(getParam(req.params.id));
  res.json({ data: { id: getParam(req.params.id) }, message: "Exam blackout removed." });
}, "Failed to remove the blackout.");

/** PUT /academic/:studentId/compliance { attendancePercent?, activeBacklogs?, complianceStatus?, note? } (ACADEMIC_RECORD_MANAGE) */
export const updateComplianceHandler = handle(async (req, res) => {
  const { attendancePercent, activeBacklogs, complianceStatus, note } = req.body ?? {};
  const data = await updateComplianceService(getParam(req.params.studentId), { attendancePercent, activeBacklogs, complianceStatus, note }, req.user!.name);
  res.json({ data, message: "Attendance and compliance saved." });
}, "Failed to save attendance and compliance.");
