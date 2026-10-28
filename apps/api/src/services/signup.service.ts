import bcrypt from "bcryptjs";
import { DEFAULT_SIGNUP_SETTINGS, type AccountStatus, type SignupRequest, type SignupSubmission, type User } from "@edurev/types";
import { isDbConnected } from "../config/db.js";
import { AcademicSnapshotModel, HourLogModel, StudentModel, UserModel } from "../models/index.js";
import { getSettingsService } from "./analytics.service.js";

const MAX_ATTEMPTS = 3;

function httpError(message: string, statusCode: number) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** Public sign-up configuration (whether sign-ups are open and which email domains are allowed). */
export async function getSignupConfigService(): Promise<{ enabled: boolean; domains: string[] }> {
  const settings = await getSettingsService();
  return {
    enabled: isDbConnected() && (settings.signupEnabled ?? DEFAULT_SIGNUP_SETTINGS.signupEnabled),
    domains: settings.allowedSignupDomains?.length ? settings.allowedSignupDomains : DEFAULT_SIGNUP_SETTINGS.allowedSignupDomains,
  };
}

function isDuplicateKey(err: any): boolean {
  return err?.code === 11000;
}

function registrationTaken() {
  return httpError("This registration number is already registered. Please contact your cell coordinator.", 409);
}

/**
 * Creates (or re-opens, after a rejection) a PENDING student account. Duplicate or already-active emails get
 * the same neutral "received" outcome so the form cannot be used to discover who has an account.
 * Input is validated by the controller; the role is always STUDENT.
 */
export async function signupService(input: SignupSubmission): Promise<void> {
  if (!isDbConnected()) throw httpError("Sign-up isn't available in demo data mode (no database is connected).", 503);

  const config = await getSignupConfigService();
  if (!config.enabled) throw httpError("Sign-ups are currently closed. Please contact your cell coordinator.", 403);

  const email = input.email.trim().toLowerCase();
  const domain = email.split("@")[1];
  if (!config.domains.includes(domain)) throw httpError(`Please use your college email (${config.domains.map((d) => `@${d}`).join(" or ")}).`, 400);

  const registrationNumber = input.registrationNumber.trim().toUpperCase();
  const existing = await UserModel.findOne({ email });

  // Registration numbers are unique across sign-ups and student records
  const [regUser, regStudent] = await Promise.all([
    UserModel.findOne({ "signup.registrationNumber": registrationNumber }).lean<User>(),
    StudentModel.findOne({ registrationNumber }).lean(),
  ]);
  if (regStudent || (regUser && regUser.email !== email)) throw registrationTaken();

  const details = {
    registrationNumber,
    program: input.program,
    course: input.course,
    year: input.year,
    requestedAt: new Date().toISOString(),
  };

  if (existing) {
    // Only a rejected request can be re-submitted, and only a few times. Anything else stays silent.
    const attempts = existing.signup?.attempts ?? 0;
    if (existing.status !== "REJECTED" || attempts >= MAX_ATTEMPTS) return;
    existing.set({
      name: input.name.trim(),
      passwordHash: await bcrypt.hash(input.password, 10),
      status: "PENDING_APPROVAL",
      signup: { ...details, attempts: attempts + 1 },
    });
    try {
      await existing.save();
    } catch (err) {
      if (isDuplicateKey(err)) throw registrationTaken();
      throw err;
    }
    return;
  }

  try {
    await UserModel.create({
      id: `usr-${registrationNumber.toLowerCase()}`,
      name: input.name.trim(),
      email,
      passwordHash: await bcrypt.hash(input.password, 10),
      role: "STUDENT",
      status: "PENDING_APPROVAL",
      signup: { ...details, attempts: 1 },
    });
  } catch (err: any) {
    // A concurrent request may have won the race: same email → silent, same registration number → conflict
    if (isDuplicateKey(err)) {
      if (err.keyPattern?.email) return;
      throw registrationTaken();
    }
    throw err;
  }
}

function toRequest(user: User): SignupRequest {
  const s = user.signup!;
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    registrationNumber: s.registrationNumber,
    program: s.program,
    course: s.course,
    year: s.year,
    status: (user.status ?? "ACTIVE") as AccountStatus,
    requestedAt: s.requestedAt,
    attempts: s.attempts,
    decidedBy: s.decidedBy,
    decidedAt: s.decidedAt,
    rejectionReason: s.rejectionReason,
    studentId: user.studentId,
  };
}

export async function listSignupRequestsService(status?: AccountStatus): Promise<SignupRequest[]> {
  if (!isDbConnected()) return [];
  const filter: Record<string, unknown> = { "signup.registrationNumber": { $exists: true } };
  if (status) filter.status = status;
  const users = await UserModel.find(filter).sort({ "signup.requestedAt": -1 }).lean<User[]>();
  return users.map(toRequest);
}

function isoWeek(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function pendingUser(userId: string) {
  if (!isDbConnected()) throw httpError("Sign-up requests aren't available in demo data mode.", 503);
  const user = await UserModel.findOne({ id: userId });
  if (!user || !user.signup?.registrationNumber) throw httpError("Sign-up request not found.", 404);
  if (user.status !== "PENDING_APPROVAL") throw httpError(`This request was already ${user.status === "ACTIVE" ? "approved" : "rejected"}.`, 409);
  return user;
}

/**
 * Approves a sign-up: creates the student record at TIER_1 with an academic record that blocks allocation
 * until a Faculty Director enters the official CGPA, and activates the account.
 */
export async function approveSignupService(userId: string, decidedBy: string): Promise<SignupRequest> {
  const user = await pendingUser(userId);
  const s = user.signup!;
  const studentId = `stu-${s.registrationNumber.toLowerCase()}`;
  if (await StudentModel.exists({ $or: [{ id: studentId }, { registrationNumber: s.registrationNumber }] })) {
    throw httpError("A student record with this registration number already exists.", 409);
  }

  const initials = user.name
    .split(/\s+/)
    .map((part: string) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  await StudentModel.create({
    id: studentId,
    registrationNumber: s.registrationNumber,
    name: user.name,
    email: user.email,
    avatarInitials: initials || "ST",
    program: s.program,
    course: s.course,
    year: s.year,
    tier: "TIER_1",
    status: "ACTIVE",
    skills: [],
    trainingProgress: 0,
    progress: 0,
    cgpa: 0,
    joinedAt: new Date().toISOString().slice(0, 10),
    projectsCompleted: 0,
    earnings: 0,
    mentor: "Unassigned",
  });
  // Not eligible for allocation until the official CGPA is recorded
  await AcademicSnapshotModel.updateOne(
    { studentId },
    { $setOnInsert: { studentId, cgpa: 0, requiredCgpa: 7, cgpaStatus: "RESTRICTED", complianceStatus: "WARNING" } },
    { upsert: true }
  );
  await HourLogModel.updateOne(
    { studentId },
    { $setOnInsert: { studentId, period: isoWeek(), allowedHours: 20, loggedHours: 0, remainingHours: 20, status: "NORMAL" } },
    { upsert: true }
  );

  user.set({ status: "ACTIVE", studentId, "signup.decidedBy": decidedBy, "signup.decidedAt": new Date().toISOString(), "signup.rejectionReason": undefined });
  await user.save();
  return toRequest(user.toObject());
}

export async function rejectSignupService(userId: string, decidedBy: string, reason: string): Promise<SignupRequest> {
  const user = await pendingUser(userId);
  user.set({ status: "REJECTED", "signup.decidedBy": decidedBy, "signup.decidedAt": new Date().toISOString(), "signup.rejectionReason": reason });
  await user.save();
  return toRequest(user.toObject());
}

/** Test/cleanup helper: removes a signed-up account and anything created for it. */
export async function deleteSignupAccount(email: string): Promise<void> {
  if (!isDbConnected()) return;
  const user = await UserModel.findOne({ email: email.toLowerCase() }).lean<User>();
  if (!user) return;
  if (user.studentId) {
    await StudentModel.deleteOne({ id: user.studentId });
    await AcademicSnapshotModel.deleteOne({ studentId: user.studentId });
    await HourLogModel.deleteOne({ studentId: user.studentId });
  }
  await UserModel.deleteOne({ id: user.id });
}
