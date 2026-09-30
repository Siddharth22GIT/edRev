import type { Request, Response } from "express";
import {
  getEarningsService,
  getPlatformAccountsService,
  submitEarningService,
  verifyEarningService,
} from "../services/earnings.service.js";

const errorResponse = (res: Response, message: string, status = 400) =>
  res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || "";

export async function getEarningsHandler(req: Request, res: Response): Promise<void> {
  const studentId = req.query.studentId as string | undefined;
  try {
    const data = await getEarningsService(studentId);
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch earnings.", 500);
  }
}

export async function submitEarningHandler(req: Request, res: Response): Promise<void> {
  const { studentId, platformName, originalAmount, originalCurrency = "USD", exchangeRate = 83.2, evidence = "Uploaded receipt" } = req.body;
  
  if (!studentId || !platformName || !originalAmount) {
    errorResponse(res, "studentId, platformName, and originalAmount are required.");
    return;
  }

  try {
    const data = await submitEarningService({
      studentId,
      platformName,
      originalAmount: Number(originalAmount),
      originalCurrency,
      exchangeRate: Number(exchangeRate),
      evidence,
    });
    res.status(201).json({ data, note: "Earning entry saved." });
  } catch (err: any) {
    errorResponse(res, err.message || "Unable to submit earning.", 400);
  }
}

export async function verifyEarningHandler(req: Request, res: Response): Promise<void> {
  const { verifiedBy = "FACULTY_DIRECTOR", status = "VERIFIED" } = req.body;
  const id = getParam(req.params.id);
  try {
    const data = await verifyEarningService(id, verifiedBy, status);
    res.json({ data });
  } catch (err: any) {
    const statusCode = err.statusCode || 404;
    errorResponse(res, err.message || "Earning not found.", statusCode);
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
