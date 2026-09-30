import type { Request, Response } from "express";
import {
  checkSafeguardsService,
  getBlackoutPeriodsService,
  getHourLogService,
  getSafeguardsService,
  overrideHourCapService,
} from "../services/safeguard.service.js";

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
  res.status(201).json({ data: req.body, note: "Hour log received." });
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
  const { studentId, role, reason } = req.body;
  if (!reason || role !== "FACULTY_DIRECTOR") {
    errorResponse(res, "A Faculty Director reason is required.", 400);
    return;
  }

  try {
    const data = await overrideHourCapService(studentId, role, reason);
    res.json({
      data,
      approvedBy: "FACULTY_DIRECTOR",
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const status = err.statusCode || 400;
    errorResponse(res, err.message || "Unable to override hour cap.", status);
  }
}
