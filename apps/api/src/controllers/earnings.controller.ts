import type { Request, Response } from "express";
import {
  getEarningsService,
  getPlatformAccountsService,
  getStudentEarningsSummaryService,
  submitEarningService,
  verifyEarningService,
} from "../services/earnings.service.js";

const errorResponse = (res: Response, message: string, status = 400) =>
  res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || "";

export async function getEarningsHandler(req: Request, res: Response): Promise<void> {
  const user = req.user;
  let targetStudentId = req.query.studentId as string | undefined;

  // Student Privacy Rule: Students can ONLY view their own private earnings
  if (user?.role === "STUDENT") {
    targetStudentId = user.studentId || user.id;
  }

  try {
    const data = await getEarningsService(targetStudentId);
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch earnings.", 500);
  }
}

export async function getStudentEarningsSummaryHandler(req: Request, res: Response): Promise<void> {
  const user = req.user;
  let targetStudentId = req.query.studentId as string || req.params.studentId as string;

  if (user?.role === "STUDENT") {
    targetStudentId = user.studentId || user.id;
  }

  if (!targetStudentId) {
    errorResponse(res, "Student ID is required for earnings summary.", 400);
    return;
  }

  try {
    const data = await getStudentEarningsSummaryService(targetStudentId);
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch student earnings summary.", 500);
  }
}

export async function submitEarningHandler(req: Request, res: Response): Promise<void> {
  const user = req.user;
  
  // Student identity MUST come from authenticated session
  const studentId = user?.role === "STUDENT" ? user.studentId || user.id : req.body.studentId;
  const { platformName, projectTitle, originalAmount, originalCurrency, exchangeRate, earningDate, evidence, screenshotUrl } = req.body;
  
  if (!studentId) {
    errorResponse(res, "Authenticated student identity is required.", 401);
    return;
  }

  if (!platformName || !originalAmount || Number(originalAmount) <= 0) {
    errorResponse(res, "Platform name and a valid positive earning amount are required.");
    return;
  }

  try {
    const data = await submitEarningService({
      studentId,
      platformName: String(platformName).trim(),
      projectTitle: projectTitle ? String(projectTitle).trim() : undefined,
      originalAmount: Number(originalAmount),
      originalCurrency: originalCurrency ? String(originalCurrency).trim().toUpperCase() : "USD",
      exchangeRate: exchangeRate ? Number(exchangeRate) : undefined,
      earningDate: earningDate ? String(earningDate) : undefined,
      evidence: evidence ? String(evidence).trim() : "Proof of payout submitted",
      screenshotUrl: screenshotUrl ? String(screenshotUrl) : undefined,
    });
    res.status(201).json({ data, message: "Earnings record submitted and pending institutional verification." });
  } catch (err: any) {
    const statusCode = err.statusCode || 400;
    errorResponse(res, err.message || "Unable to submit earning record.", statusCode);
  }
}

export async function verifyEarningHandler(req: Request, res: Response): Promise<void> {
  const id = getParam(req.params.id);
  const { status = "VERIFIED", rejectionReason } = req.body;
  const verifierName = req.user?.name || req.user?.email || "INSTITUTIONAL_VERIFIER";

  if (!["VERIFIED", "REJECTED"].includes(status)) {
    errorResponse(res, "Valid verification status (VERIFIED or REJECTED) is required.", 400);
    return;
  }

  if (status === "REJECTED" && !rejectionReason) {
    errorResponse(res, "A clear rejection reason is required when rejecting an earning record.", 400);
    return;
  }

  try {
    const data = await verifyEarningService(id, verifierName, status, rejectionReason);
    res.json({
      data,
      message: status === "VERIFIED" ? "Earnings record verified successfully." : "Earnings record marked as REJECTED.",
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 400;
    errorResponse(res, err.message || "Failed to process earnings verification.", statusCode);
  }
}

export async function getPlatformAccountsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getPlatformAccountsService();
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch platform accounts.", 500);
  }
}
