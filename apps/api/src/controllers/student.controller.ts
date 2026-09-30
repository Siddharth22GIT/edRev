import type { Request, Response } from "express";
import {
  getStudentByIdService,
  getStudentsService,
  getStudentTierService,
  getStudentTrainingService,
  updateStudentTierService,
} from "../services/student.service.js";


const errorResponse = (res: Response, message: string, status = 400) =>
  res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || "";

export async function getStudentsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getStudentsService();
    res.json({ data });
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
    const status = err.statusCode || 400;
    errorResponse(res, err.message || "Failed to update student tier.", status);
  }
}

