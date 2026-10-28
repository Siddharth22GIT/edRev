import type { Request, Response } from "express";
import { changePasswordService, getMeService, loginService, updatePreferencesService } from "../services/auth.service.js";
import type { UserPreferences } from "@edurev/types";

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

/** Signed-in user changes their own password. Requires the current password. */
export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword) {
    errorResponse(res, "Current and new password are required.");
    return;
  }
  if (newPassword.length < 8 || newPassword.length > 128 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    errorResponse(res, "New password must be 8 to 128 characters and include a letter and a number.");
    return;
  }
  if (newPassword === currentPassword) {
    errorResponse(res, "New password must be different from the current one.");
    return;
  }

  try {
    await changePasswordService(req.user!.id, currentPassword, newPassword);
    res.json({ message: "Password changed." });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to change password.", err.statusCode || 400);
  }
}

const PREFERENCE_KEYS: (keyof UserPreferences)[] = ["celebrations", "reduceMotion", "showBadges"];

/** Signed-in user updates their own preferences. Only known boolean keys are accepted. */
export async function updatePreferencesHandler(req: Request, res: Response): Promise<void> {
  const body = req.body ?? {};
  const update: Partial<UserPreferences> = {};
  for (const key of PREFERENCE_KEYS) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "boolean") {
      errorResponse(res, `${key} must be true or false.`);
      return;
    }
    update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    errorResponse(res, `Nothing to update. Preferences: ${PREFERENCE_KEYS.join(", ")}.`);
    return;
  }

  try {
    const data = await updatePreferencesService(req.user!.id, update);
    res.json({ data, message: "Preferences saved." });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to save preferences.", err.statusCode || 400);
  }
}
