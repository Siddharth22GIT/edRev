import {
  addDaysYmd,
  cooldownUntil,
  evaluateSafeguards,
  isHardRule,
  isOverrideActive,
  SAFEGUARD_RULE_ORDER,
  SAFEGUARD_RULES,
  type AcademicSnapshot,
  type Allocation,
  type BlackoutPeriod,
  type ComplianceStatus,
  type HourLog,
  type Opportunity,
  type Role,
  type Safeguard,
  type SafeguardCheck,
  type SafeguardFacts,
  type SafeguardOverride,
  type SafeguardRuleId,
  type SafeguardRuleResult,
  type Student,
  can,
} from "@edurev/types";
import { academicSnapshots as mockAcademic, blackouts as mockBlackouts, hourLogs as mockHourLogs } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AcademicSnapshotModel, BlackoutPeriodModel, HourLogModel, JobRunModel, SafeguardOverrideModel } from "../models/index.js";
import { dateInTimeZone } from "../utils/time.js";
import { candidateDue, weekContext, weeklyHoursSummaryService } from "./hours.service.js";
import { activeStudents, allocationsOfStudent, findOpportunity, findStudent, httpError, isLive, isPaused, newId, strip } from "./workload.js";

// Phase 4 (F1, G1–G7): the safeguards engine. This file gathers the facts; the rules themselves are the pure
// `evaluateSafeguards` in packages/types/src/safeguards.ts. Doc: docs/modules/safeguards.md

// Demo data mode keeps overrides in memory (reset on restart, like all mock data)
const memOverrides: SafeguardOverride[] = [];

/* ---------------- facts ---------------- */

async function academicOf(studentId: string): Promise<AcademicSnapshot | null> {
  if (isDbConnected()) {
    const doc = await AcademicSnapshotModel.findOne({ studentId }).lean();
    return doc ? strip<AcademicSnapshot>(doc) : null;
  }
  return mockAcademic.find((a) => a.studentId === studentId) ?? null;
}

async function legacyHourLog(studentId: string): Promise<HourLog | null> {
  if (isDbConnected()) {
    const doc = await HourLogModel.findOne({ studentId }).lean();
    return doc ? strip<HourLog>(doc) : null;
  }
  return mockHourLogs.find((h) => h.studentId === studentId) ?? null;
}

export async function getBlackoutPeriodsService(): Promise<BlackoutPeriod[]> {
  if (isDbConnected()) return (await BlackoutPeriodModel.find().sort({ startDate: 1 }).lean()).map((b) => strip<BlackoutPeriod>(b));
  return [...mockBlackouts].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** G4: a blackout applies to a student when its programme / year lists are empty or include them. */
export function blackoutAppliesTo(b: BlackoutPeriod, student: Pick<Student, "program" | "year">): boolean {
  const programOk = !b.programs || b.programs.length === 0 || b.programs.includes(student.program);
  const yearOk = !b.years || b.years.length === 0 || b.years.includes(student.year);
  return programOk && yearOk;
}

export async function activeOverridesFor(studentId: string, now = new Date()): Promise<SafeguardOverride[]> {
  const list = await listOverridesService(studentId);
  return list.filter((o) => isOverrideActive(o, now));
}

/** D5: when each of the student's projects went overdue (late deliveries and live work past its deadline). */
function overdueMoments(allocations: Allocation[], now: Date): string[] {
  const moments: string[] = [];
  for (const a of allocations) {
    if (a.status === "COMPLETED" && a.onTime === false) moments.push(a.slaDeadline || a.deliveredAt || a.allocatedAt);
    else if (isLive(a) && !isPaused(a) && a.slaDeadline && new Date(a.slaDeadline).getTime() < now.getTime()) moments.push(a.slaDeadline);
  }
  return moments;
}

/** Maps the rule results onto the pre-Phase 4 `SafeguardCheck` flags, so older screens keep working. */
function toCheck(studentId: string, results: SafeguardRuleResult[], extra: Partial<SafeguardCheck>): SafeguardCheck {
  const blocked = (...rules: SafeguardRuleId[]) => results.some((r) => rules.includes(r.rule) && r.outcome === "BLOCK");
  const blocks = results.filter((r) => r.outcome === "BLOCK");
  return {
    studentId,
    tierEligible: !blocked("TIER"),
    cgpaEligible: !blocked("CGPA", "CGPA_RECORDED"),
    hourEligible: !blocked("HOURS"),
    blackoutEligible: !blocked("BLACKOUT"),
    complianceEligible: !blocked("COMPLIANCE", "ATTENDANCE"),
    eligible: blocks.length === 0,
    reasons: blocks.map((r) => r.message),
    warnings: results.filter((r) => r.outcome === "WARN").map((r) => r.message),
    rules: results,
    checkedAt: new Date().toISOString(),
    ...extra,
  };
}

/** What the rule check needs for one student (and optionally one opportunity). */
export async function gatherSafeguardFacts(student: Student, opportunity: Opportunity | null, now = new Date()): Promise<SafeguardFacts> {
  const ctx = await weekContext(now);
  const [academic, hourLog, blackouts, allocations, overrides] = await Promise.all([
    academicOf(student.id),
    legacyHourLog(student.id),
    getBlackoutPeriodsService(),
    allocationsOfStudent(student.id),
    activeOverridesFor(student.id, now),
  ]);

  // Checking work the student already holds: it isn't a new project on top of itself
  const holdsIt = Boolean(opportunity && allocations.some((a) => a.opportunityId === opportunity.id && isLive(a)));
  const candidate = opportunity && !holdsIt ? opportunity : undefined;
  const live = allocations.filter(isLive);

  const mine = blackouts.filter((b) => blackoutAppliesTo(b, student));
  const today = ctx.today;
  const now_ = mine.find((b) => addDaysYmd(b.startDate, -ctx.limits.blackoutBufferDays) <= today && today <= b.endDate) ?? null;
  let inProject: BlackoutPeriod | null = null;
  if (candidate) {
    const dueYmd = dateInTimeZone(candidateDue(candidate, now, ctx.timeZone), ctx.timeZone);
    inProject = mine.find((b) => b.startDate <= dueYmd && b.endDate >= today) ?? null;
  }

  const recorded = Boolean(academic && (academic.cgpaRecordedAt || academic.cgpa > 0));
  return {
    now,
    limits: ctx.limits,
    tier: student.tier,
    ...(opportunity ? { requiredTier: opportunity.requiredTier } : {}),
    academic: academic
      ? {
          recorded,
          cgpa: academic.cgpa,
          requiredCgpa: academic.requiredCgpa,
          complianceStatus: academic.complianceStatus,
          ...(typeof academic.attendancePercent === "number" ? { attendancePercent: academic.attendancePercent } : {}),
          ...(typeof academic.activeBacklogs === "number" ? { activeBacklogs: academic.activeBacklogs } : {}),
        }
      : null,
    blackoutNow: now_ ? { title: now_.title, startDate: now_.startDate, endDate: now_.endDate, inBuffer: today < now_.startDate } : null,
    blackoutInProject: inProject ? { title: inProject.title, startDate: inProject.startDate, endDate: inProject.endDate } : null,
    hours: await weeklyHoursSummaryService(student.id, { now, ...(candidate ? { candidate } : {}) }),
    legacyHoursBlocked: Boolean(hourLog && hourLog.status === "BLOCKED" && !hourLog.overridden),
    activeProjects: live.length - (holdsIt ? 1 : 0),
    cooldownUntil: cooldownUntil(overdueMoments(allocations, now), ctx.limits, now),
    overrides,
  };
}

/**
 * F1: can this student take (this) work right now? Returns every rule with its outcome, what unlocks it and
 * who can help, plus the older yes/no flags. Allocation and reassignment refuse when `eligible` is false.
 */
export async function checkSafeguardsService(studentId: string, opportunityId?: string): Promise<SafeguardCheck> {
  const student = await findStudent(studentId);
  if (!student) {
    return { studentId, tierEligible: false, cgpaEligible: false, hourEligible: false, blackoutEligible: false, complianceEligible: false, eligible: false, reasons: ["Student not found."] };
  }
  const opportunity = opportunityId ? await findOpportunity(opportunityId) : null;
  const facts = await gatherSafeguardFacts(student, opportunity);
  return toCheck(studentId, evaluateSafeguards(facts), { hours: facts.hours, ...(opportunity ? { opportunityId: opportunity.id } : {}) });
}

/* ---------------- G7: health cards ---------------- */

const OWNER: Record<SafeguardRuleId, string> = {
  TIER: "Administrator",
  CGPA_RECORDED: "Faculty Director",
  CGPA: "Faculty Director",
  ATTENDANCE: "Faculty Director",
  COMPLIANCE: "Faculty Director",
  BLACKOUT: "Academic calendar",
  HOURS: "Mentors",
  PARALLEL: "Cell Coordinator",
  COOLDOWN: "Cell Coordinator",
};

/**
 * G7: one card per rule with how many active students it blocks or warns right now. Worked out on request
 * (no stored copy that could go stale). The tier rule only applies to a specific opportunity, so it isn't counted.
 */
export async function getSafeguardsService(): Promise<Safeguard[]> {
  const now = new Date();
  const students = await activeStudents();
  const counts = new Map<SafeguardRuleId, { blocked: number; warned: number }>();
  for (const student of students) {
    const results = evaluateSafeguards(await gatherSafeguardFacts(student, null, now));
    const seen = new Set<string>();
    for (const r of results) {
      const key = `${r.rule}:${r.outcome}`;
      if (seen.has(key)) continue; // one student counts once per rule
      seen.add(key);
      const c = counts.get(r.rule) ?? { blocked: 0, warned: 0 };
      if (r.outcome === "BLOCK") c.blocked++;
      if (r.outcome === "WARN") c.warned++;
      counts.set(r.rule, c);
    }
  }
  return SAFEGUARD_RULE_ORDER.filter((rule) => rule !== "TIER").map((rule) => {
    const c = counts.get(rule) ?? { blocked: 0, warned: 0 };
    const info = SAFEGUARD_RULES[rule];
    return {
      id: `rule-${rule.toLowerCase()}`,
      name: info.label,
      description: info.description,
      status: c.blocked > 0 || c.warned > 0 ? "attention" : "healthy",
      owner: OWNER[rule],
      lastCheckedAt: now.toISOString(),
      rule,
      hard: info.hard,
      blockedCount: c.blocked,
      warnedCount: c.warned,
      checkedStudents: students.length,
    } satisfies Safeguard;
  });
}

/** G7: when the daily checks last ran (null before the first run). */
export async function lastDailyRunService(): Promise<{ lastRunAt: string; summary: Record<string, number> } | null> {
  if (isDbConnected()) {
    const doc = await JobRunModel.findOne({ id: "daily-checks" }).lean<{ lastRunAt: string; summary: Record<string, number> }>();
    return doc ? { lastRunAt: doc.lastRunAt, summary: doc.summary ?? {} } : null;
  }
  return memJobRun;
}
let memJobRun: { lastRunAt: string; summary: Record<string, number> } | null = null;
export async function recordDailyRunService(summary: Record<string, number>): Promise<void> {
  const lastRunAt = new Date().toISOString();
  if (isDbConnected()) {
    await JobRunModel.updateOne({ id: "daily-checks" }, { $set: { lastRunAt, summary } }, { upsert: true });
    return;
  }
  memJobRun = { lastRunAt, summary };
}

/* ---------------- legacy hour log (pre-Phase 4) ---------------- */

export async function getHourLogService(studentId: string): Promise<HourLog | null> {
  return legacyHourLog(studentId);
}

export async function overrideHourCapService(studentId: string, role: Role, reason: string, approverId?: string): Promise<HourLog> {
  if (!reason || !can(role, "HOUR_CAP_OVERRIDE")) throw httpError("An authorized Faculty Director or Cell Coordinator reason is required.", 400);

  const audit = { overrideReason: reason, overriddenBy: approverId ? `${role}:${approverId}` : role, overriddenAt: new Date().toISOString() };
  if (isDbConnected()) {
    const log = await HourLogModel.findOne({ studentId });
    if (!log) throw httpError("Hour log not found.", 404);
    log.status = "WARNING";
    log.overridden = true;
    log.remainingHours = 1;
    log.set(audit);
    await log.save();
    return strip<HourLog>(log.toObject());
  }
  const log = mockHourLogs.find((x) => x.studentId === studentId);
  if (!log) throw httpError("Hour log not found.", 404);
  Object.assign(log, { status: "WARNING", overridden: true, remainingHours: 1 }, audit);
  return log;
}

/* ---------------- G5: overrides ---------------- */

/** G5: an override lasts at most 30 days. */
export const MAX_OVERRIDE_DAYS = 30;

export async function listOverridesService(studentId: string): Promise<SafeguardOverride[]> {
  if (isDbConnected()) return (await SafeguardOverrideModel.find({ studentId }).sort({ createdAt: -1 }).lean()).map((o) => strip<SafeguardOverride>(o));
  return memOverrides.filter((o) => o.studentId === studentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** G5: overrides a soft rule for one student. Hard rules (tier, CGPA, exam blackout, parallel projects) refuse with 400. */
export async function createOverrideService(input: { studentId: string; rule: string; reason: string; days: number }, by: string): Promise<SafeguardOverride> {
  const rule = input.rule as SafeguardRuleId;
  if (!SAFEGUARD_RULES[rule]) throw httpError(`Unknown rule. Rules: ${Object.keys(SAFEGUARD_RULES).join(", ")}.`, 400);
  if (isHardRule(rule)) throw httpError(`"${SAFEGUARD_RULES[rule].label}" is a hard rule and can't be overridden.`, 400);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < 5 || reason.length > 300) throw httpError("A reason of 5 to 300 characters is required.", 400);
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_OVERRIDE_DAYS) throw httpError(`days must be a whole number from 1 to ${MAX_OVERRIDE_DAYS}.`, 400);
  if (!(await findStudent(input.studentId))) throw httpError("Student not found.", 404);

  const now = new Date();
  const override: SafeguardOverride = { id: newId("ovr"), studentId: input.studentId, rule, reason, createdBy: by, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + input.days * 86_400_000).toISOString() };
  if (isDbConnected()) await SafeguardOverrideModel.create(override);
  else memOverrides.push(override);
  return override;
}

/** Ends an override early (kept in the log with who revoked it). */
export async function revokeOverrideService(id: string, by: string): Promise<SafeguardOverride> {
  const changes = { revokedAt: new Date().toISOString(), revokedBy: by };
  if (isDbConnected()) {
    const doc = await SafeguardOverrideModel.findOneAndUpdate({ id, revokedAt: { $exists: false } }, { $set: changes }, { new: true }).lean();
    if (!doc) {
      const exists = await SafeguardOverrideModel.exists({ id });
      throw httpError(exists ? "This override was already revoked." : "Override not found.", exists ? 409 : 404);
    }
    return strip<SafeguardOverride>(doc);
  }
  const o = memOverrides.find((x) => x.id === id);
  if (!o) throw httpError("Override not found.", 404);
  if (o.revokedAt) throw httpError("This override was already revoked.", 409);
  return Object.assign(o, changes);
}

/* ---------------- G4: blackouts ---------------- */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function createBlackoutService(input: Record<string, unknown>, by: string): Promise<BlackoutPeriod> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const startDate = String(input.startDate ?? "");
  const endDate = String(input.endDate ?? "");
  if (title.length < 3 || title.length > 80) throw httpError("Title must be 3 to 80 characters.", 400);
  if (!YMD.test(startDate) || !YMD.test(endDate) || Number.isNaN(Date.parse(startDate)) || Number.isNaN(Date.parse(endDate))) throw httpError("startDate and endDate must be dates (YYYY-MM-DD).", 400);
  if (startDate > endDate) throw httpError("The blackout must start on or before its end date.", 400);
  const programs = Array.isArray(input.programs) ? input.programs.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim()) : [];
  const years = Array.isArray(input.years) ? input.years : [];
  if (years.some((y) => !Number.isInteger(y) || (y as number) < 1 || (y as number) > 6)) throw httpError("Years must be whole numbers from 1 to 6.", 400);

  const blackout: BlackoutPeriod = { id: newId("blackout"), title, startDate, endDate, ...(programs.length ? { programs } : {}), ...(years.length ? { years: years as number[] } : {}), createdBy: by };
  if (isDbConnected()) await BlackoutPeriodModel.create(blackout);
  else mockBlackouts.push(blackout);
  return blackout;
}

export async function deleteBlackoutService(id: string): Promise<void> {
  if (isDbConnected()) {
    const res = await BlackoutPeriodModel.deleteOne({ id });
    if (res.deletedCount === 0) throw httpError("Blackout not found.", 404);
    return;
  }
  const i = mockBlackouts.findIndex((b) => b.id === id);
  if (i < 0) throw httpError("Blackout not found.", 404);
  mockBlackouts.splice(i, 1);
}

/* ---------------- G3: attendance, backlogs, compliance ---------------- */

export interface ComplianceInput {
  attendancePercent?: number | null;
  activeBacklogs?: number | null;
  complianceStatus?: ComplianceStatus;
  note?: string;
}

/** G3: a Faculty Director records attendance, backlogs and compliance. `null` clears a value (back to "not recorded"). */
export async function updateComplianceService(studentId: string, input: ComplianceInput, by: string): Promise<AcademicSnapshot> {
  const set: Record<string, unknown> = { complianceUpdatedBy: by, complianceUpdatedAt: new Date().toISOString() };
  const unset: Record<string, 1> = {};
  let changed = false;
  if (input.attendancePercent !== undefined) {
    changed = true;
    if (input.attendancePercent === null) unset.attendancePercent = 1;
    else if (typeof input.attendancePercent !== "number" || !Number.isFinite(input.attendancePercent) || input.attendancePercent < 0 || input.attendancePercent > 100) throw httpError("attendancePercent must be a number from 0 to 100.", 400);
    else set.attendancePercent = Math.round(input.attendancePercent * 10) / 10;
  }
  if (input.activeBacklogs !== undefined) {
    changed = true;
    if (input.activeBacklogs === null) unset.activeBacklogs = 1;
    else if (!Number.isInteger(input.activeBacklogs) || input.activeBacklogs < 0 || input.activeBacklogs > 50) throw httpError("activeBacklogs must be a whole number from 0 to 50.", 400);
    else set.activeBacklogs = input.activeBacklogs;
  }
  if (input.complianceStatus !== undefined) {
    changed = true;
    if (!["COMPLIANT", "WARNING", "NON_COMPLIANT"].includes(input.complianceStatus)) throw httpError("complianceStatus must be COMPLIANT, WARNING or NON_COMPLIANT.", 400);
    set.complianceStatus = input.complianceStatus;
  }
  if (input.note !== undefined) {
    changed = true;
    if (typeof input.note !== "string" || input.note.length > 300) throw httpError("note must be text of at most 300 characters.", 400);
    set.complianceNote = input.note.trim();
  }
  if (!changed) throw httpError("Nothing to update. Fields: attendancePercent, activeBacklogs, complianceStatus, note.", 400);
  if (!(await findStudent(studentId))) throw httpError("Student not found.", 404);

  if (isDbConnected()) {
    const doc = await AcademicSnapshotModel.findOneAndUpdate(
      { studentId },
      {
        $set: set,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
        // A student without an academic record gets one that still blocks allocation until the CGPA is recorded
        $setOnInsert: { studentId, cgpa: 0, requiredCgpa: 7, cgpaStatus: "RESTRICTED", ...(set.complianceStatus ? {} : { complianceStatus: "WARNING" }) },
      },
      { new: true, upsert: true }
    ).lean();
    return strip<AcademicSnapshot>(doc);
  }
  let record = mockAcademic.find((a) => a.studentId === studentId);
  if (!record) {
    record = { studentId, cgpa: 0, requiredCgpa: 7, cgpaStatus: "RESTRICTED", complianceStatus: "WARNING" };
    mockAcademic.push(record);
  }
  Object.assign(record, set);
  for (const key of Object.keys(unset)) delete (record as unknown as Record<string, unknown>)[key];
  return record;
}

/** Test/cleanup helper. */
export async function deleteOverridesForStudents(studentIds: string[]): Promise<void> {
  if (isDbConnected()) {
    await SafeguardOverrideModel.deleteMany({ studentId: { $in: studentIds } });
    return;
  }
  for (let i = memOverrides.length - 1; i >= 0; i--) if (studentIds.includes(memOverrides[i].studentId)) memOverrides.splice(i, 1);
}

