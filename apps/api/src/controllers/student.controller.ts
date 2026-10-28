import type { Request, Response } from "express";
import {
  getStudentByIdService,
  getStudentReadinessService,
  getStudentsService,
  getStudentTierService,
  getStudentTrainingService,
  updateStudentPhotoService,
  updateStudentProfileService,
  updateStudentTierService,
  updateTrainingModuleStatusService,
} from "../services/student.service.js";
import type { StudentProfileUpdate } from "@edurev/types";
import { ownStudentId } from "../middleware/auth.middleware.js";
import { reviewTier } from "./delivery.controller.js";

const errorResponse = (res: Response, message: string, status = 400) =>
  res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || "";

export async function getStudentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await getStudentsService();
    const ownId = ownStudentId(req.user);
    // Students only ever see their own record; institutional roles see the cohort
    res.json({ data: req.user?.role === "STUDENT" ? data.filter((s) => s.id === ownId) : data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch students.", 500);
  }
}

export async function getStudentByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params.id);
    const student = await getStudentByIdService(id);
    if (!student) {
      errorResponse(res, "Student not found.", 404);
      return;
    }
    res.json({ data: student });
  } catch (err: any) {
    errorResponse(res, err.message || "Error fetching student.", 500);
  }
}

export async function getStudentReadinessHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params.id);
    const readiness = await getStudentReadinessService(id);
    if (!readiness) {
      errorResponse(res, "Student not found.", 404);
      return;
    }
    res.json({ data: readiness });
  } catch (err: any) {
    errorResponse(res, err.message || "Error fetching student readiness summary.", 500);
  }
}

export async function getStudentTierHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params.id);
    const tier = await getStudentTierService(id);
    if (!tier) {
      errorResponse(res, "Student not found.", 404);
      return;
    }
    res.json({ data: tier });
  } catch (err: any) {
    errorResponse(res, err.message || "Error fetching student tier.", 500);
  }
}

export async function getStudentTrainingHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params.id);
    const training = await getStudentTrainingService(id);
    res.json({ data: training });
  } catch (err: any) {
    errorResponse(res, err.message || "Error fetching training modules.", 500);
  }
}

export async function updateTrainingModuleStatusHandler(req: Request, res: Response): Promise<void> {
  const studentId = getParam(req.params.id);
  const moduleId = getParam(req.params.moduleId);
  const { status } = req.body;

  if (!status || !["COMPLETED", "IN_PROGRESS", "NOT_STARTED"].includes(status)) {
    errorResponse(res, "Valid status (COMPLETED, IN_PROGRESS, NOT_STARTED) is required.");
    return;
  }

  try {
    const data = await updateTrainingModuleStatusService(studentId, moduleId, status);
    const tierReview = await reviewTier(studentId);
    res.json({ data, tierReview, message: `Training module ${moduleId} status updated to ${status}.` });
  } catch (err: any) {
    const statusCode = err.statusCode || 400;
    errorResponse(res, err.message || "Failed to update training module status.", statusCode);
  }
}

export async function updateStudentTierHandler(req: Request, res: Response): Promise<void> {
  const id = getParam(req.params.id);
  const { tier } = req.body;

  if (!tier || !["TIER_1", "TIER_2", "TIER_3", "TIER_4"].includes(tier)) {
    errorResponse(res, "Valid tier (TIER_1, TIER_2, TIER_3, TIER_4) is required.");
    return;
  }

  try {
    const data = await updateStudentTierService(id, tier);
    res.json({ data, message: `Student ${id} tier successfully updated to ${tier}.` });
  } catch (err: any) {
    const statusCode = err.statusCode || 400;
    errorResponse(res, err.message || "Failed to update student tier.", statusCode);
  }
}

const MAX_PHOTO_BYTES = 512 * 1024;
const PHOTO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Checks the decoded bytes really are the declared image type (not just a relabelled file). */
function matchesImageSignature(type: string, bytes: Buffer): boolean {
  if (type === "png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === "jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

/**
 * Validates profile edits. Only bio, phone, location and skills are accepted; anything else in the body
 * (tier, cgpa, earnings, name, email…) is ignored. Returns an error message or the cleaned update.
 */
function parseProfileUpdate(body: any): { error: string } | { update: StudentProfileUpdate } {
  const update: StudentProfileUpdate = {};

  if (body?.bio !== undefined) {
    if (typeof body.bio !== "string" || body.bio.length > 500) return { error: "Bio must be text of at most 500 characters." };
    update.bio = body.bio.trim();
  }
  if (body?.phone !== undefined) {
    if (typeof body.phone !== "string" || (body.phone.trim() && !/^[+\d\s()-]{6,20}$/.test(body.phone.trim()))) {
      return { error: "Phone must be 6 to 20 digits (spaces, +, - and brackets allowed)." };
    }
    update.phone = body.phone.trim();
  }
  if (body?.location !== undefined) {
    if (typeof body.location !== "string" || body.location.length > 80) return { error: "Location must be text of at most 80 characters." };
    update.location = body.location.trim();
  }
  if (body?.skills !== undefined) {
    if (!Array.isArray(body.skills) || body.skills.some((skill: unknown) => typeof skill !== "string")) {
      return { error: "Skills must be a list of text values." };
    }
    const cleaned: string[] = Array.from(
      new Set(body.skills.map((skill: string) => skill.trim()).filter((skill: string) => skill.length > 0))
    );
    if (cleaned.length > 20 || cleaned.some((skill) => skill.length > 40)) {
      return { error: "Add at most 20 skills, each up to 40 characters." };
    }
    update.skills = cleaned;
  }

  if (Object.keys(update).length === 0) return { error: "Nothing to update. Editable fields: bio, phone, location, skills." };
  return { update };
}

export async function updateStudentProfileHandler(req: Request, res: Response): Promise<void> {
  const id = getParam(req.params.id);
  const parsed = parseProfileUpdate(req.body);
  if ("error" in parsed) {
    errorResponse(res, parsed.error);
    return;
  }

  try {
    const data = await updateStudentProfileService(id, parsed.update);
    res.json({ data, message: "Profile updated." });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to update profile.", err.statusCode || 400);
  }
}

export async function updateStudentPhotoHandler(req: Request, res: Response): Promise<void> {
  const id = getParam(req.params.id);
  const { photoDataUrl } = req.body ?? {};
  const match = typeof photoDataUrl === "string" ? PHOTO_DATA_URL.exec(photoDataUrl) : null;
  if (!match) {
    errorResponse(res, "Photo must be a PNG, JPEG or WebP image.");
    return;
  }

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) {
    errorResponse(res, "Photo must be smaller than 512 KB.");
    return;
  }
  if (!matchesImageSignature(match[1], bytes)) {
    errorResponse(res, "Photo content does not match its image type.");
    return;
  }

  try {
    const data = await updateStudentPhotoService(id, photoDataUrl);
    res.json({ data, message: "Profile photo updated." });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to update photo.", err.statusCode || 400);
  }
}

export async function deleteStudentPhotoHandler(req: Request, res: Response): Promise<void> {
  const id = getParam(req.params.id);
  try {
    const data = await updateStudentPhotoService(id, null);
    res.json({ data, message: "Profile photo removed." });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to remove photo.", err.statusCode || 400);
  }
}
