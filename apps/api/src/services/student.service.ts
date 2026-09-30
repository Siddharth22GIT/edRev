import type { Student, Tier, TierSummary, TrainingModule } from "@edurev/types";
import {
  getStudent as mockGetStudent,
  getStudentTier as mockGetStudentTier,
  students as mockStudents,
  tierRank,
  trainingModules as mockTrainingModules,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { StudentModel, TrainingModuleModel } from "../models/index.js";

export async function getStudentsService(): Promise<Student[]> {
  if (isDbConnected()) {
    const list = await StudentModel.find().lean();
    return list.map((item) => stripMongoFields<Student>(item));
  }
  return mockStudents;
}

export async function getStudentByIdService(id: string): Promise<Student | null> {
  if (isDbConnected()) {
    const student = await StudentModel.findOne({ id }).lean();
    return student ? stripMongoFields<Student>(student) : null;
  }
  return mockGetStudent(id) ?? null;
}

export async function getStudentTierService(id: string): Promise<TierSummary | null> {
  if (isDbConnected()) {
    const student = await StudentModel.findOne({ id }).lean<Student>();
    if (!student) return null;

    const rank = tierRank[student.tier as Tier] || 1;
    const nextTier: Tier | null = rank < 4 ? (`TIER_${rank + 1}` as Tier) : null;

    return {
      studentId: id,
      currentTier: student.tier,
      nextTier,
      progressToNextTier: student.trainingProgress,
      completedTraining: student.projectsCompleted,
      requirements: [
        { label: "Complete training modules", completed: student.trainingProgress >= 60 },
        { label: "Meet academic eligibility", completed: student.cgpa >= 7 },
        { label: "Complete portfolio work", completed: student.projectsCompleted >= 3 },
      ],
    };
  }

  return mockGetStudentTier(id) ?? null;
}

export async function getStudentTrainingService(id: string): Promise<TrainingModule[]> {
  if (isDbConnected()) {
    const modules = await TrainingModuleModel.find({ studentId: id }).lean();
    return modules.map((item) => stripMongoFields<TrainingModule>(item));
  }
  return mockTrainingModules[id] ?? [];
}

export async function updateStudentTierService(id: string, newTier: Tier): Promise<Student> {
  if (isDbConnected()) {
    const student = await StudentModel.findOne({ id });
    if (!student) {
      const err: any = new Error("Student not found.");
      err.statusCode = 404;
      throw err;
    }
    student.tier = newTier;
    await student.save();
    return stripMongoFields<Student>(student.toObject());
  }

  const student = mockStudents.find((s) => s.id === id);
  if (!student) {
    const err: any = new Error("Student not found.");
    err.statusCode = 404;
    throw err;
  }
  student.tier = newTier;
  return student;
}

function stripMongoFields<T>(obj: any): T {
  if (!obj) return obj as T;
  const { _id, __v, ...rest } = obj;
  return rest as T;
}

