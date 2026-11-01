import type { Request, Response } from "express";
import { confirmDeliveryService, getDeliveryRecordService } from "../services/delivery.service.js";
import { evaluateTierSuggestionService } from "../services/onboarding.service.js";
import { upsertAcademicRecordService } from "../services/analytics.service.js";

const errorResponse = (res: Response, message: string, status = 400) => res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string => (Array.isArray(param) ? param[0] : param || "");

/** Re-checks tier eligibility after the record changed. Never blocks the main action. */
async function reviewTier(studentId: string) {
  try {
    const suggestion = await evaluateTierSuggestionService(studentId);
    return suggestion ? { status: suggestion.status, suggestedTier: suggestion.suggestedTier } : null;
  } catch {
    return null;
  }
}

/** Staff confirm allocated work was delivered (optionally with the actual delivery time). */
export async function confirmDeliveryHandler(req: Request, res: Response): Promise<void> {
  const { deliveredAt } = req.body ?? {};
  if (deliveredAt !== undefined) {
    const when = typeof deliveredAt === "string" ? new Date(deliveredAt) : null;
    if (!when || Number.isNaN(when.getTime())) {
      errorResponse(res, "deliveredAt must be a valid date and time.");
      return;
    }
    if (when.getTime() > Date.now() + 5 * 60 * 1000) {
      errorResponse(res, "deliveredAt cannot be in the future.");
      return;
    }
  }

  try {
    const data = await confirmDeliveryService(getParam(req.params.id), req.user!.name, deliveredAt);
    const record = await getDeliveryRecordService(data.studentId);
    const tierReview = await reviewTier(data.studentId);
    res.json({ data, record, tierReview, message: data.onTime ? "Delivery confirmed: on time." : "Delivery confirmed: late." });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to confirm delivery.", err.statusCode || 400);
  }
}

export async function getDeliveryRecordHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await getDeliveryRecordService(getParam(req.params.id));
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch the delivery record.", 500);
  }
}

/** Faculty Director / Administrator record a student's official CGPA. */
export async function updateAcademicRecordHandler(req: Request, res: Response): Promise<void> {
  const { cgpa, requiredCgpa } = req.body ?? {};
  const valid = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 10;
  if (!valid(cgpa)) {
    errorResponse(res, "Official CGPA must be a number from 0 to 10.");
    return;
  }
  if (requiredCgpa !== undefined && !valid(requiredCgpa)) {
    errorResponse(res, "Required CGPA must be a number from 0 to 10.");
    return;
  }

  try {
    const studentId = getParam(req.params.studentId);
    const round = (n: number) => Math.round(n * 100) / 100;
    const data = await upsertAcademicRecordService(studentId, round(cgpa), requiredCgpa === undefined ? undefined : round(requiredCgpa));
    const tierReview = await reviewTier(studentId);
    res.json({ data, tierReview, message: "Official academic record saved." });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to save the academic record.", err.statusCode || 400);
  }
}

export { reviewTier };
