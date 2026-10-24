import type { Request, Response } from "express";
import type { Role } from "@edurev/types";
import {
  getEarningsService,
  getEarningsSummaryService,
  getPlatformAccountsService,
  getStudentEarningsSummaryService,
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
        studentId, // derived from authenticated user
        platformName: String(platformName).trim(),
        originalAmount: numAmount,
        originalCurrency: String(originalCurrency).trim(),
        exchangeRate: numExchangeRate,
        evidence: String(evidence).trim(),
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
        errorResponse(res, err.message || "Failed to update earning verification status.", statusCode);
        const statusCode = err.statusCode || 400;
        errorResponse(res, err.message || "Failed to process earnings verification.", statusCode);
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
