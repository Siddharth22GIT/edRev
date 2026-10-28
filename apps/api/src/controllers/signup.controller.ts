import type { Request, Response } from "express";
import type { AccountStatus } from "@edurev/types";
import { approveSignupService, listSignupRequestsService, rejectSignupService } from "../services/signup.service.js";

const errorResponse = (res: Response, message: string, status = 400) => res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string => (Array.isArray(param) ? param[0] : param || "");

export async function listSignupRequestsHandler(req: Request, res: Response): Promise<void> {
  const status = req.query.status as string | undefined;
  if (status && !["PENDING_APPROVAL", "ACTIVE", "REJECTED"].includes(status)) {
    errorResponse(res, "status must be PENDING_APPROVAL, ACTIVE or REJECTED.");
    return;
  }
  try {
    res.json({ data: await listSignupRequestsService(status as AccountStatus | undefined) });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch sign-up requests.", 500);
  }
}

export async function approveSignupHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await approveSignupService(getParam(req.params.id), `${req.user!.role}:${req.user!.id}`);
    res.json({ data, message: `${data.name} can now sign in.` });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to approve the request.", err.statusCode || 400);
  }
}

export async function rejectSignupHandler(req: Request, res: Response): Promise<void> {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 300) {
    errorResponse(res, "Please give a reason (3 to 300 characters). The student will see it.");
    return;
  }
  try {
    const data = await rejectSignupService(getParam(req.params.id), `${req.user!.role}:${req.user!.id}`, reason);
    res.json({ data, message: "Request rejected." });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to reject the request.", err.statusCode || 400);
  }
}
