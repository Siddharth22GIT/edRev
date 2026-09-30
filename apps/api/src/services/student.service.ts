import type { AcademicSnapshot, HourLog, SafeguardCheck, Student, Tier, TierSummary, TrainingModule } from "@edurev/types";
import {
  academicSnapshots as mockAcademicSnapshots,
  getStudent as mockGetStudent,
  getStudentTier as mockGetStudentTier,
  hourLogs as mockHourLogs,
  students as mockStudents,
  tierRank,
  trainingModules as mockTrainingModules,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import {
  AcademicSnapshotModel,
  BlackoutPeriodModel,
  HourLogModel,
  StudentModel,
  TrainingModuleModel,
} from "../models/index.js";
import { checkSafeguardsService } from "./safeguard.service.js";

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

    const modules = await TrainingModuleModel.find({ studentId: id }).lean<TrainingModule[]>();
    const completedCount = modules.filter((m) => m.status === "COMPLETED").length;
    const progressPercentage = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : student.trainingProgress;

    const rank = tierRank[student.tier as Tier] || 1;
    const nextTier: Tier | null = rank < 4 ? (`TIER_${rank + 1}` as Tier) : null;

    return {
      studentId: id,
      currentTier: student.tier,
      nextTier,
      progressToNextTier: progressPercentage,
      completedTraining: student.projectsCompleted,
      requirements: [
        { label: "Complete training modules", completed: progressPercentage >= 60 },
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

export async function updateTrainingModuleStatusService(
  studentId: string,
  moduleId: string,
  status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED"
): Promise<TrainingModule[]> {
  if (isDbConnected()) {
    const module = await TrainingModuleModel.findOne({ studentId, id: moduleId });
    if (!module) {
      const err: any = new Error("Training module not found.");
      err.statusCode = 404;
      throw err;
    }

    module.status = status;
    module.completionPercentage = status === "COMPLETED" ? 100 : status === "IN_PROGRESS" ? 50 : 0;
    await module.save();

    // Recalculate student training progress (supporting info only; does NOT change official tier)
    const allModules = await TrainingModuleModel.find({ studentId });
    const completedCount = allModules.filter((m) => m.status === "COMPLETED").length;
    const progressPct = allModules.length > 0 ? Math.round((completedCount / allModules.length) * 100) : 0;

    const student = await StudentModel.findOne({ id: studentId });
    if (student) {
      student.trainingProgress = progressPct;
      student.progress = progressPct;
      await student.save();
    }

    return allModules.map((item) => stripMongoFields<TrainingModule>(item.toObject()));
  }

  const modules = mockTrainingModules[studentId] || [];
  const m = modules.find((x) => x.id === moduleId);
  if (m) {
    m.status = status;
    m.completionPercentage = status === "COMPLETED" ? 100 : status === "IN_PROGRESS" ? 50 : 0;
  }
  return modules;
}

export interface StudentReadinessSummary {
  student: Student;
  academic: AcademicSnapshot | null;
  training: {
    modules: TrainingModule[];
    completedCount: number;
    totalCount: number;
    progressPercentage: number;
  };
  hours: HourLog | null;
  blackoutActive: boolean;
  safeguardCheck: SafeguardCheck;
}

export async function getStudentReadinessService(id: string): Promise<StudentReadinessSummary | null> {
  const student = await getStudentByIdService(id);
  if (!student) return null;

  let academic: AcademicSnapshot | null = null;
  let hours: HourLog | null = null;
  let blackoutActive = false;
  let trainingModulesList: TrainingModule[] = [];

  if (isDbConnected()) {
    const [acadDoc, hourDoc, blackouts, trainDocs] = await Promise.all([
      AcademicSnapshotModel.findOne({ studentId: id }).lean(),
      HourLogModel.findOne({ studentId: id }).lean(),
      BlackoutPeriodModel.find().lean(),
      TrainingModuleModel.find({ studentId: id }).lean(),
    ]);

    academic = acadDoc ? stripMongoFields<AcademicSnapshot>(acadDoc) : null;
    hours = hourDoc ? stripMongoFields<HourLog>(hourDoc) : null;
    const now = new Date();
    blackoutActive = blackouts.some((b: any) => now >= new Date(b.startDate) && now <= new Date(b.endDate));
    trainingModulesList = trainDocs.map((item) => stripMongoFields<TrainingModule>(item));
  } else {
    academic = mockAcademicSnapshots.find((a) => a.studentId === id) || null;
    hours = mockHourLogs.find((h) => h.studentId === id) || null;
    trainingModulesList = mockTrainingModules[id] || [];
  }

  const safeguardCheck = await checkSafeguardsService(id);
  const completedCount = trainingModulesList.filter((m) => m.status === "COMPLETED").length;
  const totalCount = trainingModulesList.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : student.trainingProgress;

  return {
    student,
    academic,
    training: {
      modules: trainingModulesList,
      completedCount,
      totalCount,
      progressPercentage,
    },
    hours,
    blackoutActive,
    safeguardCheck,
  };
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
