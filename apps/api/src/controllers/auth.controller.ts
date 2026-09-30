import type { Request, Response } from "express";
import { getMeService, loginService } from "../services/auth.service.js";

const errorResponse = (res: Response, message: string, status = 400) =>
  res.status(status).json({ message });

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    errorResponse(res, "Email and password are required.");
    return;
  }

  try {
    const result = await loginService(email, password);
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    errorResponse(res, err.message || "Login failed.", status);
  }
}

export async function getMeHandler(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.user.id) {
    errorResponse(res, "Authentication token is missing or invalid.", 401);
    return;
  }

  try {
    const user = await getMeService(req.user.id);
    res.json({ user });
  } catch (err: any) {
    const status = err.statusCode || 404;
    errorResponse(res, err.message || "Failed to retrieve user info.", status);
  }
}
