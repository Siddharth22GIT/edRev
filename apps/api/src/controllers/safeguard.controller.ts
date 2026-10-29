import type { Request, Response } from "express";
import {
  checkSafeguardsService,
  getBlackoutPeriodsService,
  getHourLogService,
  getSafeguardsService,
  overrideHourCapService,
} from "../services/safeguard.service.js";
import { can } from "@edurev/types";
import { ownStudentId } from "../middleware/auth.middleware.js";

const errorResponse = (res: Response, message: string, status = 400) =>
  res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || "";

export async function getSafeguardsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getSafeguardsService();
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch safeguards.", 500);
  }
}

export async function checkSafeguardsHandler(req: Request, res: Response): Promise<void> {
  try {
    const studentId = getParam(req.params.studentId);
    const data = await checkSafeguardsService(studentId);
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

  // S12: validate instead of echoing whatever was sent. Storing hours needs weekly periods, which arrive with
  // the safeguards engine (Phase 4, G2); until then the note says plainly that nothing was saved.
  const hours = Number(req.body?.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    errorResponse(res, "hours must be a number greater than 0 and at most 24.");
    return;
  }
  const date = typeof req.body?.date === "string" ? req.body.date.slice(0, 10) : undefined;
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 300) : undefined;

  res.status(201).json({
    data: { studentId, hours, ...(date ? { date } : {}), ...(note ? { note } : {}) },
    note: "Hour log received but not stored yet: weekly hour tracking arrives with the safeguards engine.",
  });
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
