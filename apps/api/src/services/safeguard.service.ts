import type { BlackoutPeriod, HourLog, Safeguard, SafeguardCheck, Student, Tier } from "@edurev/types";
import {
  blackouts as mockBlackouts,
  checkSafeguards as mockCheckSafeguards,
  hourLogs as mockHourLogs,
  safeguards as mockSafeguards,
  tierRank,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import {
  AcademicSnapshotModel,
  BlackoutPeriodModel,
  HourLogModel,
  OpportunityModel,
  SafeguardModel,
  StudentModel,
} from "../models/index.js";

export async function checkSafeguardsService(studentId: string, opportunityId?: string): Promise<SafeguardCheck> {
  if (isDbConnected()) {
    const student = await StudentModel.findOne({ id: studentId }).lean<Student>();
    if (!student) {
      return {
        studentId,
        tierEligible: false,
        cgpaEligible: false,
        hourEligible: false,
        blackoutEligible: false,
        complianceEligible: false,
        eligible: false,
        reasons: ["Student not found."],
      };
    }

    const hourLog = await HourLogModel.findOne({ studentId }).lean<HourLog>();
    const academic = await AcademicSnapshotModel.findOne({ studentId }).lean();
    const opp = opportunityId ? await OpportunityModel.findOne({ id: opportunityId }).lean() : null;
    const blackouts = await BlackoutPeriodModel.find().lean();

    const now = new Date();
    const blackout = blackouts.some((b: any) => now >= new Date(b.startDate) && now <= new Date(b.endDate));
    const studentRank = tierRank[student.tier as Tier] || 1;
    const oppRank = opp ? tierRank[opp.requiredTier as Tier] || 1 : 1;
    const tierEligible = !opp || studentRank >= oppRank;
    const cgpaEligible = academic ? academic.cgpaStatus === "ELIGIBLE" : true;
    const hourEligible = hourLog ? hourLog.status !== "BLOCKED" : true;
    const blackoutEligible = !blackout;
    const complianceEligible = academic ? academic.complianceStatus !== "NON_COMPLIANT" : true;

    const reasons: string[] = [];
    if (!tierEligible) reasons.push("Student tier does not meet the opportunity requirement.");
    if (!cgpaEligible) reasons.push("CGPA eligibility is restricted.");
    if (!hourEligible) reasons.push("Weekly work-hour limit reached.");
    if (blackout) reasons.push("Exam blackout is active.");
    if (!complianceEligible) reasons.push("Compliance requirements are incomplete.");

    return {
      studentId,
      tierEligible,
      cgpaEligible,
      hourEligible,
      blackoutEligible,
      complianceEligible,
      eligible: reasons.length === 0,
      reasons,
    };
  }

  return mockCheckSafeguards(studentId, opportunityId);
}

export async function getSafeguardsService(): Promise<Safeguard[]> {
  if (isDbConnected()) {
    const list = await SafeguardModel.find().lean();
    return list.map((item) => stripMongoFields<Safeguard>(item));
  }
  return mockSafeguards;
}

export async function getHourLogService(studentId: string): Promise<HourLog | null> {
  if (isDbConnected()) {
    const log = await HourLogModel.findOne({ studentId }).lean();
    return log ? stripMongoFields<HourLog>(log) : null;
  }
  return mockHourLogs.find((x) => x.studentId === studentId) ?? null;
}

export async function getBlackoutPeriodsService(): Promise<BlackoutPeriod[]> {
  if (isDbConnected()) {
    const list = await BlackoutPeriodModel.find().lean();
    return list.map((item) => stripMongoFields<BlackoutPeriod>(item));
  }
  return mockBlackouts;
}

export async function overrideHourCapService(studentId: string, role: string, reason: string): Promise<HourLog> {
  if (!reason || role !== "FACULTY_DIRECTOR") {
    const err: any = new Error("A Faculty Director reason is required.");
    err.statusCode = 400;
    throw err;
  }

  if (isDbConnected()) {
    const log = await HourLogModel.findOne({ studentId });
    if (!log) {
      const err: any = new Error("Hour log not found.");
      err.statusCode = 404;
      throw err;
    }

    log.status = "WARNING";
    log.overridden = true;
    log.remainingHours = 1;
    await log.save();

    return stripMongoFields<HourLog>(log.toObject());
  }

  const log = mockHourLogs.find((x) => x.studentId === studentId);
  if (log) {
    log.status = "WARNING";
    log.overridden = true;
    log.remainingHours = 1;
    return log;
  }
  throw new Error("Hour log not found.");
}

function stripMongoFields<T>(obj: any): T {
  if (!obj) return obj as T;
  const { _id, __v, ...rest } = obj;
  return rest as T;
}
