import type { Request, Response } from "express";
import type { Role } from "@edurev/types";
import {
  getEarningsService,
  getEarningsSummaryService,
  getPlatformAccountsService,
  submitEarningService,
  verifyEarningService,
} from "../services/earnings.service.js";

export const AUTHORIZED_INSTITUTIONAL_ROLES: Role[] = [
  "FACULTY_DIRECTOR",
  "CELL_COORDINATOR",
  "ADMINISTRATOR",
  "DEAN",
  "PLACEMENT_OFFICE",
];

const errorResponse = (res: Response, message: string, status = 400) =>
  res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || "";

export async function getEarningsHandler(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    errorResponse(res, "Authentication required.", 401);
    return;
  }

  let studentId: string | undefined;

  if (user.role === "STUDENT") {
    studentId = user.studentId || user.id;
    if (!studentId) {
      errorResponse(res, "Authenticated student identity missing.", 403);
      return;
    }
    const requestedStudentId = req.query.studentId as string | undefined;
    if (requestedStudentId && requestedStudentId !== studentId) {
      errorResponse(res, "Forbidden: Students can only view their own earnings.", 403);
      return;
    }
  } else {
    const isAuthorized = AUTHORIZED_INSTITUTIONAL_ROLES.includes(user.role);
    if (!isAuthorized) {
      errorResponse(res, `Forbidden: Role '${user.role}' is not authorized to view earnings.`, 403);
      return;
    }
    studentId = req.query.studentId as string | undefined;
  }

  try {
    const data = await getEarningsService(studentId);
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch earnings.", 500);
  }
}

export async function getEarningsSummaryHandler(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    errorResponse(res, "Authentication required.", 401);
    return;
  }

  let studentId: string | undefined;

  if (user.role === "STUDENT") {
    studentId = user.studentId || user.id;
    if (!studentId) {
      errorResponse(res, "Authenticated student identity missing.", 403);
      return;
    }
    const requestedStudentId = req.query.studentId as string | undefined;
    if (requestedStudentId && requestedStudentId !== studentId) {
      errorResponse(res, "Forbidden: Students can only view their own earnings summary.", 403);
      return;
    }
  } else {
    const isAuthorized = AUTHORIZED_INSTITUTIONAL_ROLES.includes(user.role);
    if (!isAuthorized) {
      errorResponse(res, `Forbidden: Role '${user.role}' is not authorized to view earnings summary.`, 403);
      return;
    }
    studentId = req.query.studentId as string | undefined;
  }

  try {
    const data = await getEarningsSummaryService(studentId);
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch earnings summary.", 500);
  }
}

export async function submitEarningHandler(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    errorResponse(res, "Authentication required.", 401);
    return;
  }

  if (user.role !== "STUDENT") {
    errorResponse(res, "Forbidden: Only students can submit earnings.", 403);
    return;
  }

  // Derive student identity strictly from the authenticated user token (not client request body)
  const studentId = user.studentId || user.id;
  if (!studentId) {
    errorResponse(res, "Authenticated student identity missing.", 403);
    return;
  }

  const {
    platformName,
    originalAmount,
    originalCurrency = "USD",
    exchangeRate = 83.2,
    evidence = "Uploaded receipt",
  } = req.body;

  if (!platformName || originalAmount === undefined || originalAmount === null || originalAmount === "") {
    errorResponse(res, "platformName and originalAmount are required.");
    return;
  }

  const numAmount = Number(originalAmount);
  if (isNaN(numAmount) || numAmount <= 0) {
    errorResponse(res, "originalAmount must be a positive number.");
    return;
  }

  const numExchangeRate = Number(exchangeRate);
  if (isNaN(numExchangeRate) || numExchangeRate <= 0) {
    errorResponse(res, "exchangeRate must be a positive number.");
    return;
  }

  try {
    const data = await submitEarningService({
      studentId, // derived from authenticated user
      platformName: String(platformName).trim(),
      originalAmount: numAmount,
      originalCurrency: String(originalCurrency).trim(),
      exchangeRate: numExchangeRate,
      evidence: String(evidence).trim(),
    });
    res.status(201).json({ data, note: "Earning entry saved." });
  } catch (err: any) {
    errorResponse(res, err.message || "Unable to submit earning.", 400);
  }
}

export async function verifyEarningHandler(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    errorResponse(res, "Authentication required.", 401);
    return;
  }

  const { status = "VERIFIED", rejectionReason } = req.body;
  if (status !== "VERIFIED" && status !== "REJECTED") {
    errorResponse(res, "status must be either VERIFIED or REJECTED.", 400);
    return;
  }

  if (status === "REJECTED" && (!rejectionReason || typeof rejectionReason !== "string" || !rejectionReason.trim())) {
    errorResponse(res, "rejectionReason is required when rejecting an earning.", 400);
    return;
  }

  // Derive verifier strictly from authenticated user
  const verifiedBy = user.name || user.email || user.role;
  const id = getParam(req.params.id);

  try {
    const data = await verifyEarningService(
      id,
      verifiedBy,
      status,
      rejectionReason ? String(rejectionReason).trim() : undefined
    );
    res.json({ data });
  } catch (err: any) {
    const statusCode = err.statusCode || 400;
    errorResponse(res, err.message || "Failed to update earning verification status.", statusCode);
  }
}

export async function getPlatformAccountsHandler(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    errorResponse(res, "Authentication required.", 401);
    return;
  }

  let studentId: string | undefined;

  if (user.role === "STUDENT") {
    studentId = user.studentId || user.id;
    if (!studentId) {
      errorResponse(res, "Authenticated student identity missing.", 403);
      return;
    }
    const requestedStudentId = req.query.studentId as string | undefined;
    if (requestedStudentId && requestedStudentId !== studentId) {
      errorResponse(res, "Forbidden: Students can only view their own platform accounts.", 403);
      return;
    }
  } else {
    const isAuthorized = AUTHORIZED_INSTITUTIONAL_ROLES.includes(user.role);
    if (!isAuthorized) {
      errorResponse(res, `Forbidden: Role '${user.role}' is not authorized to view platform accounts.`, 403);
      return;
    }
    studentId = req.query.studentId as string | undefined;
  }

  try {
    const data = await getPlatformAccountsService(studentId);
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch platform accounts.", 500);
  }
}
