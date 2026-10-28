import { suggestTier, type OnboardingSubmission, type Student, type TierSuggestion, type TierSuggestionStatus } from "@edurev/types";
import { students as mockStudents } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { StudentModel, TierSuggestionModel } from "../models/index.js";
import { getDeliveryRecordService } from "./delivery.service.js";
import { getStudentReadinessService, updateStudentTierService } from "./student.service.js";

// Demo data mode keeps suggestions in memory (they reset on restart, like all mock data)
const mockSuggestions: TierSuggestion[] = [];

function httpError(message: string, statusCode: number) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function updateStudentFields(id: string, fields: Partial<Student>): Promise<Student> {
  if (isDbConnected()) {
    const student = await StudentModel.findOne({ id });
    if (!student) throw httpError("Student not found.", 404);
    student.set(fields);
    await student.save();
    const { _id, __v, ...rest } = student.toObject();
    return rest as Student;
  }
  const student = mockStudents.find((s) => s.id === id);
  if (!student) throw httpError("Student not found.", 404);
  Object.assign(student, fields);
  return student;
}

/** Saves first-login answers, marks onboarding complete and (re)evaluates a tier suggestion. */
export async function completeOnboardingService(
  studentId: string,
  submission: OnboardingSubmission
): Promise<{ student: Student; suggestion: TierSuggestion | null }> {
  const fields: Partial<Student> = {
    skills: submission.skills,
    interests: submission.interests,
    availabilityHours: submission.availabilityHours,
    onboardingCompletedAt: new Date().toISOString(),
  };
  if (submission.claimedCgpa !== undefined) fields.claimedCgpa = submission.claimedCgpa;
  if (submission.goals !== undefined) fields.goals = submission.goals;
  if (submission.portfolioLinks !== undefined) fields.portfolioLinks = submission.portfolioLinks;
  if (submission.bio !== undefined) fields.bio = submission.bio;

  const student = await updateStudentFields(studentId, fields);
  const suggestion = await evaluateTierSuggestionService(studentId);
  return { student, suggestion };
}

/** "I'll do this later": stops the wizard from opening automatically. */
export async function skipOnboardingService(studentId: string): Promise<Student> {
  return updateStudentFields(studentId, { onboardingSkippedAt: new Date().toISOString() });
}

/**
 * Works out the highest tier the student's real record supports. If that is above their official tier,
 * creates a PENDING suggestion (or refreshes the existing pending one). Never changes the tier itself.
 */
export async function evaluateTierSuggestionService(studentId: string): Promise<TierSuggestion | null> {
  const readiness = await getStudentReadinessService(studentId);
  if (!readiness) throw httpError("Student not found.", 404);

  const { student } = readiness;
  // Only the official academic record counts; self-reported CGPA never does
  const officialCgpa = readiness.academic ? readiness.academic.cgpa : null;
  const delivery = await getDeliveryRecordService(studentId);

  const result = suggestTier({
    currentTier: student.tier,
    officialCgpa,
    trainingPercent: readiness.training.progressPercentage,
    skillsCount: student.skills.length,
    completedDeliveries: delivery.completed,
    onTimeDeliveries: delivery.onTime,
  });
  if (!result) {
    await withdrawStalePendingSuggestion(studentId);
    return null;
  }

  const reasons = result.reasons;
  const notes: string[] = [];
  if (student.claimedCgpa !== undefined && officialCgpa !== null && Math.abs(student.claimedCgpa - officialCgpa) >= 0.5) {
    notes.push(`Self-reported CGPA ${student.claimedCgpa.toFixed(2)} differs from the official ${officialCgpa.toFixed(2)}.`);
  }
  if (!readiness.safeguardCheck.eligible) {
    notes.push(`Currently blocked for allocation: ${readiness.safeguardCheck.reasons.join(" ")}`);
  }
  const values = { studentName: student.name, currentTier: student.tier, suggestedTier: result.tier, reasons, notes };

  if (isDbConnected()) {
    const pending = await TierSuggestionModel.findOne({ studentId, status: "PENDING" });
    if (pending) {
      pending.set(values);
      await pending.save();
      return strip(pending.toObject());
    }
    const created = await TierSuggestionModel.create({ id: newId(), studentId, status: "PENDING", createdAt: new Date().toISOString(), ...values });
    return strip(created.toObject());
  }

  const pending = mockSuggestions.find((s) => s.studentId === studentId && s.status === "PENDING");
  if (pending) {
    Object.assign(pending, values);
    return pending;
  }
  const created: TierSuggestion = { id: newId(), studentId, status: "PENDING", createdAt: new Date().toISOString(), ...values };
  mockSuggestions.unshift(created);
  return created;
}

/** A pending suggestion whose criteria are no longer met (e.g. rules changed, late delivery) is withdrawn. */
async function withdrawStalePendingSuggestion(studentId: string): Promise<void> {
  const update = { status: "DISMISSED" as const, decidedBy: "SYSTEM: criteria no longer met", decidedAt: new Date().toISOString() };
  if (isDbConnected()) {
    await TierSuggestionModel.updateOne({ studentId, status: "PENDING" }, { $set: update });
    return;
  }
  const pending = mockSuggestions.find((s) => s.studentId === studentId && s.status === "PENDING");
  if (pending) Object.assign(pending, update);
}

export async function listTierSuggestionsService(status?: TierSuggestionStatus): Promise<TierSuggestion[]> {
  if (isDbConnected()) {
    const list = await TierSuggestionModel.find(status ? { status } : {}).sort({ createdAt: -1 }).lean();
    return list.map(strip);
  }
  return mockSuggestions.filter((s) => !status || s.status === status);
}

/** Admin decision. Approving applies the suggested tier through the normal tier update. */
export async function decideTierSuggestionService(id: string, decision: "APPROVED" | "DISMISSED", decidedBy: string): Promise<TierSuggestion> {
  const suggestion = isDbConnected()
    ? await TierSuggestionModel.findOne({ id })
    : mockSuggestions.find((s) => s.id === id);
  if (!suggestion) throw httpError("Tier suggestion not found.", 404);
  if (suggestion.status !== "PENDING") throw httpError(`This suggestion was already ${suggestion.status.toLowerCase()}.`, 409);

  if (decision === "APPROVED") {
    await updateStudentTierService(suggestion.studentId, suggestion.suggestedTier);
  }

  const update = { status: decision, decidedBy, decidedAt: new Date().toISOString() };
  if (isDbConnected()) {
    suggestion.set(update);
    await suggestion.save();
    return strip(suggestion.toObject());
  }
  Object.assign(suggestion, update);
  return suggestion as TierSuggestion;
}

/** Test/cleanup helper: removes every suggestion for a student. */
export async function deleteTierSuggestionsForStudent(studentId: string): Promise<void> {
  if (isDbConnected()) {
    await TierSuggestionModel.deleteMany({ studentId });
    return;
  }
  for (let i = mockSuggestions.length - 1; i >= 0; i--) {
    if (mockSuggestions[i].studentId === studentId) mockSuggestions.splice(i, 1);
  }
}

function newId(): string {
  return `ts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function strip(obj: any): TierSuggestion {
  const { _id, __v, ...rest } = obj;
  return rest as TierSuggestion;
}
