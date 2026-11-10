import type { Allocation, Opportunity, Student, User } from "@edurev/types";
import { allocations as mockAllocations, opportunities as mockOpportunities, students as mockStudents } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AllocationModel, OpportunityModel, StudentModel } from "../models/index.js";
import { sendMessageService } from "./messages.service.js";

// Small shared readers for Phase 4 (safeguards, hours, SLA). Both storage modes, like every service.

export function httpError(message: string, statusCode: number) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export function strip<T>(obj: any): T {
  if (!obj) return obj as T;
  const { _id, __v, createdAt, updatedAt, ...rest } = obj;
  // Keep our own string createdAt (Mongoose timestamps add Date ones only on models that use them)
  return (typeof createdAt === "string" ? { ...rest, createdAt } : rest) as T;
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Work still in progress: allocated or active, not delivered and not cancelled. */
export const isLive = (a: Allocation) => a.status !== "COMPLETED" && a.status !== "CANCELLED";
/** G10: paused work has an open pause (no `to`). */
export const isPaused = (a: Allocation) => (a.pauses ?? []).some((p) => !p.to);

export async function allocationsOfStudent(studentId: string): Promise<Allocation[]> {
  if (isDbConnected()) return (await AllocationModel.find({ studentId }).lean()).map((a) => strip<Allocation>(a));
  return mockAllocations.filter((a) => a.studentId === studentId);
}

export async function liveAllocations(): Promise<Allocation[]> {
  if (isDbConnected()) return (await AllocationModel.find({ status: { $nin: ["COMPLETED", "CANCELLED"] } }).lean()).map((a) => strip<Allocation>(a));
  return mockAllocations.filter(isLive);
}

export async function findAllocation(opportunityId: string): Promise<Allocation | null> {
  if (isDbConnected()) {
    const doc = await AllocationModel.findOne({ opportunityId }).lean();
    return doc ? strip<Allocation>(doc) : null;
  }
  return mockAllocations.find((a) => a.opportunityId === opportunityId) ?? null;
}

export async function opportunitiesByIds(ids: string[]): Promise<Map<string, Opportunity>> {
  const unique = Array.from(new Set(ids));
  const list: Opportunity[] = isDbConnected()
    ? (await OpportunityModel.find({ id: { $in: unique } }).lean()).map((o) => strip<Opportunity>(o))
    : mockOpportunities.filter((o) => unique.includes(o.id));
  return new Map(list.map((o) => [o.id, o]));
}

export async function findOpportunity(id: string): Promise<Opportunity | null> {
  return (await opportunitiesByIds([id])).get(id) ?? null;
}

export async function findStudent(id: string): Promise<Student | null> {
  if (isDbConnected()) {
    const doc = await StudentModel.findOne({ id }).lean();
    return doc ? strip<Student>(doc) : null;
  }
  return mockStudents.find((s) => s.id === id) ?? null;
}

export async function studentsByIds(ids: string[]): Promise<Map<string, Student>> {
  const unique = Array.from(new Set(ids));
  const list: Student[] = isDbConnected()
    ? (await StudentModel.find({ id: { $in: unique } }).lean()).map((s) => strip<Student>(s))
    : mockStudents.filter((s) => unique.includes(s.id));
  return new Map(list.map((s) => [s.id, s]));
}

export async function activeStudents(): Promise<Student[]> {
  if (isDbConnected()) return (await StudentModel.find({ status: "ACTIVE" }).lean()).map((s) => strip<Student>(s));
  return mockStudents.filter((s) => s.status === "ACTIVE");
}

/** Reminders and automatic notes come from this account. It owns the threads, so no staff inbox fills up with them. */
export const SYSTEM_ACTOR: Omit<User, "passwordHash"> = { id: "usr-system", name: "REVALANCHE reminders", email: "system@revalanche.local", role: "ADMINISTRATOR" };

/** Best effort: a failed reminder never breaks the action that caused it. */
export async function notifyStudent(studentId: string, subject: string, body: string, important = false): Promise<boolean> {
  try {
    await sendMessageService(SYSTEM_ACTOR, { audience: { type: "STUDENTS", studentIds: [studentId] }, subject: subject.slice(0, 120), body, priority: important ? "IMPORTANT" : "NORMAL", allowReplies: false });
    return true;
  } catch (error) {
    console.warn(`[phase4] could not message ${studentId}: ${(error as Error).message}`);
    return false;
  }
}
