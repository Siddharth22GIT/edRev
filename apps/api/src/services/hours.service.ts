import {
  addDaysYmd,
  hoursPerWeek,
  inDateRanges,
  weekStartOf,
  type Allocation,
  type CheckinProjectLine,
  type HourEntry,
  type Opportunity,
  type SafeguardLimits,
  type WeeklyCheckin,
  type WeeklyHoursSummary,
  type WeeklyProjectLoad,
} from "@edurev/types";
import { allocations as mockAllocations } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AllocationModel, HourEntryModel, WeeklyCheckinModel } from "../models/index.js";
import { dateInTimeZone, deadlineInstant, getInstitutionTimeZone } from "../utils/time.js";
import { getSafeguardLimitsService } from "./limits.service.js";
import { activeStudents, allocationsOfStudent, findAllocation, httpError, isLive, isPaused, newId, notifyStudent, opportunitiesByIds, strip } from "./workload.js";

// D10 / G2: weekly hours. Planned hours (estimatedHours spread over the project's weeks) gate allocation; the
// Monday check-in records what really happened; the optional Start/Stop timer fills the check-in.
// Doc: docs/modules/safeguards.md §2 and §3

/** HOURS-03: a timer left running is cut at this length (a forgotten timer, not a 30-hour day). */
export const MAX_TIMER_MINUTES = 8 * 60;
/** HOURS-05: check-ins can be filled in or corrected for this many past weeks. */
export const CHECKIN_EDITABLE_WEEKS = 4;
const MAX_WEEK_HOURS = 80;

// Demo data mode keeps entries and check-ins in memory (reset on restart, like all mock data)
const mem = { entries: [] as HourEntry[], checkins: [] as WeeklyCheckin[] };

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface WeekContext {
  timeZone: string;
  today: string;
  weekStart: string;
  limits: SafeguardLimits;
}

export async function weekContext(now = new Date()): Promise<WeekContext> {
  const timeZone = await getInstitutionTimeZone();
  const today = dateInTimeZone(now, timeZone);
  return { timeZone, today, weekStart: weekStartOf(today), limits: await getSafeguardLimitsService() };
}

/** D1: the break cap during a break period, the term cap otherwise. */
export function capFor(ymd: string, limits: SafeguardLimits): { cap: number; capKind: "TERM" | "BREAK" } {
  return inDateRanges(ymd, limits.breakPeriods) ? { cap: limits.breakHoursCap, capKind: "BREAK" } : { cap: limits.termHoursCap, capKind: "TERM" };
}

/** D10: the hours/week of one allocated project (from allocation to its agreed deadline). */
export function plannedHoursFor(allocation: Allocation, opportunity: Opportunity | undefined): number {
  if (!opportunity) return 0;
  const start = new Date(allocation.slaStartAt || allocation.allocatedAt);
  const due = allocation.slaDeadline ? new Date(allocation.slaDeadline) : null;
  return hoursPerWeek(opportunity.estimatedHours, start, due);
}

/** Planned weekly load of the student's live, unpaused projects. */
export async function plannedLoad(studentId: string): Promise<WeeklyProjectLoad[]> {
  const live = (await allocationsOfStudent(studentId)).filter((a) => isLive(a) && !isPaused(a));
  const opps = await opportunitiesByIds(live.map((a) => a.opportunityId));
  return live.map((a) => ({ opportunityId: a.opportunityId, title: opps.get(a.opportunityId)?.title ?? a.opportunityId, hoursPerWeek: plannedHoursFor(a, opps.get(a.opportunityId)) }));
}

/** The deadline a candidate opportunity would get at allocation (mirrors `agreedDeadline` without a staff choice). */
export function candidateDue(opportunity: Opportunity, now: Date, timeZone: string): Date {
  for (const value of [opportunity.deadline, opportunity.slaDeadline]) {
    const due = deadlineInstant(value, timeZone);
    if (due && due.getTime() > now.getTime()) return due;
  }
  return new Date(now.getTime() + 7 * 86_400_000);
}

/* ---------------- storage ---------------- */

async function entriesBetween(studentId: string, from: string, to: string): Promise<HourEntry[]> {
  if (isDbConnected()) {
    return (await HourEntryModel.find({ studentId, date: { $gte: from, $lte: to }, running: { $ne: true } }).lean()).map((e) => strip<HourEntry>(e));
  }
  return mem.entries.filter((e) => e.studentId === studentId && e.date >= from && e.date <= to && !e.running);
}

async function findCheckin(studentId: string, weekStart: string): Promise<WeeklyCheckin | null> {
  if (isDbConnected()) {
    const doc = await WeeklyCheckinModel.findOne({ studentId, weekStart }).lean();
    return doc ? strip<WeeklyCheckin>(doc) : null;
  }
  return mem.checkins.find((c) => c.studentId === studentId && c.weekStart === weekStart) ?? null;
}

async function touchAllocation(opportunityId: string | undefined, at: string): Promise<void> {
  if (!opportunityId) return;
  if (isDbConnected()) {
    await AllocationModel.updateOne({ opportunityId }, { $set: { lastHoursAt: at } });
    return;
  }
  const a = mockAllocations.find((x) => x.opportunityId === opportunityId);
  if (a) a.lastHoursAt = at;
}

/* ---------------- summary ---------------- */

/**
 * D10: the student's week. `usedHours` = planned hours of live projects + outside paid work from the latest
 * check-in (this week's, else last week's). With `candidate`, also the hours/week that opportunity would add.
 */
export async function weeklyHoursSummaryService(studentId: string, options: { now?: Date; candidate?: Opportunity } = {}): Promise<WeeklyHoursSummary> {
  const now = options.now ?? new Date();
  const ctx = await weekContext(now);
  const { cap, capKind } = capFor(ctx.today, ctx.limits);
  const projects = await plannedLoad(studentId);
  const planned = round1(projects.reduce((sum, p) => sum + p.hoursPerWeek, 0));
  const latestCheckin = (await findCheckin(studentId, ctx.weekStart)) ?? (await findCheckin(studentId, addDaysYmd(ctx.weekStart, -7)));
  const otherPaidHours = latestCheckin?.otherPaidHours ?? 0;
  const recorded = await entriesBetween(studentId, ctx.weekStart, addDaysYmd(ctx.weekStart, 6));
  const used = round1(planned + otherPaidHours);
  const summary: WeeklyHoursSummary = {
    studentId,
    weekStart: ctx.weekStart,
    cap,
    capKind,
    plannedProjectHours: planned,
    otherPaidHours,
    usedHours: used,
    remainingHours: round1(Math.max(0, cap - used)),
    projects,
    recordedHours: round1(recorded.reduce((sum, e) => sum + e.minutes, 0) / 60),
  };
  if (options.candidate) summary.candidateHours = hoursPerWeek(options.candidate.estimatedHours, now, candidateDue(options.candidate, now, ctx.timeZone));
  return summary;
}

/* ---------------- entries: typed in, or the Start/Stop timer ---------------- */

/** The project must be the student's own live allocation. */
async function assertOwnLiveProject(studentId: string, opportunityId: string): Promise<Allocation> {
  const allocation = await findAllocation(opportunityId);
  if (!allocation || allocation.studentId !== studentId) throw httpError("This project isn't allocated to you.", 404);
  if (!isLive(allocation)) throw httpError("This project is already finished.", 409);
  return allocation;
}

export interface ManualHoursInput {
  studentId: string;
  hours: number;
  date?: string;
  note?: string;
  opportunityId?: string;
  createdBy: string;
}

/** G2 (was S12): stores typed-in hours for a day. Future days are refused; old days only within the check-in window. */
export async function addManualHoursService(input: ManualHoursInput): Promise<HourEntry> {
  const ctx = await weekContext();
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : ctx.today;
  if (date > ctx.today) throw httpError("Hours can't be logged for a future day.", 400);
  if (date < addDaysYmd(ctx.weekStart, -7 * CHECKIN_EDITABLE_WEEKS)) throw httpError(`Hours can only be logged for the last ${CHECKIN_EDITABLE_WEEKS} weeks.`, 400);
  if (input.opportunityId) await assertOwnLiveProject(input.studentId, input.opportunityId);

  const now = new Date().toISOString();
  const entry: HourEntry = {
    id: newId("hr"),
    studentId: input.studentId,
    ...(input.opportunityId ? { opportunityId: input.opportunityId } : {}),
    date,
    minutes: Math.round(input.hours * 60),
    source: "MANUAL",
    ...(input.note ? { note: input.note } : {}),
    createdBy: input.createdBy,
    createdAt: now,
  };
  if (isDbConnected()) await HourEntryModel.create(entry);
  else mem.entries.push(entry);
  await touchAllocation(input.opportunityId, now);
  return entry;
}

export async function runningTimerService(studentId: string): Promise<HourEntry | null> {
  if (isDbConnected()) {
    const doc = await HourEntryModel.findOne({ studentId, running: true }).lean();
    return doc ? strip<HourEntry>(doc) : null;
  }
  return mem.entries.find((e) => e.studentId === studentId && e.running) ?? null;
}

/** D10: start the per-project timer. One running timer per student (unique index, HOURS-02). */
export async function startTimerService(studentId: string, opportunityId: string, by: string): Promise<HourEntry> {
  await assertOwnLiveProject(studentId, opportunityId);
  const ctx = await weekContext();
  const now = new Date().toISOString();
  const entry: HourEntry = { id: newId("hr"), studentId, opportunityId, date: ctx.today, minutes: 0, source: "TIMER", startedAt: now, running: true, createdBy: by, createdAt: now };
  if (isDbConnected()) {
    try {
      await HourEntryModel.create(entry);
    } catch (error: any) {
      if (error?.code === 11000) throw httpError("A timer is already running. Stop it first.", 409);
      throw error;
    }
  } else {
    if (mem.entries.some((e) => e.studentId === studentId && e.running)) throw httpError("A timer is already running. Stop it first.", 409);
    mem.entries.push(entry);
  }
  await touchAllocation(opportunityId, now);
  return entry;
}

/** Stops the running timer (atomic: two stops at once save it once, the other gets 409). */
export async function stopTimerService(studentId: string): Promise<HourEntry> {
  const running = await runningTimerService(studentId);
  if (!running) throw httpError("No timer is running.", 409);
  const end = new Date();
  let minutes = Math.max(0, Math.round((end.getTime() - new Date(running.startedAt!).getTime()) / 60000));
  const capped = minutes > MAX_TIMER_MINUTES;
  if (capped) minutes = MAX_TIMER_MINUTES;
  const changes = { minutes, endedAt: end.toISOString(), ...(capped ? { capped: true } : {}) };

  let saved: HourEntry;
  if (isDbConnected()) {
    const doc = await HourEntryModel.findOneAndUpdate({ id: running.id, running: true }, { $set: changes, $unset: { running: 1 } }, { new: true }).lean();
    if (!doc) throw httpError("The timer was already stopped.", 409);
    saved = strip<HourEntry>(doc);
  } else {
    Object.assign(running, changes);
    delete running.running;
    saved = running;
  }
  await touchAllocation(saved.opportunityId, saved.endedAt!);
  return saved;
}

export async function listEntriesService(studentId: string, weekStart: string): Promise<HourEntry[]> {
  const list = await entriesBetween(studentId, weekStart, addDaysYmd(weekStart, 6));
  return list.sort((a, b) => (a.date + (a.startedAt ?? a.createdAt)).localeCompare(b.date + (b.startedAt ?? b.createdAt)));
}

/* ---------------- the Monday check-in ---------------- */

/** True for a Monday (YYYY-MM-DD). */
const isMonday = (ymd: string) => /^\d{4}-\d{2}-\d{2}$/.test(ymd) && weekStartOf(ymd) === ymd;

/** The pre-filled form: planned hours per live project, actual = hours recorded that week. */
async function prefill(studentId: string, weekStart: string, limits: SafeguardLimits): Promise<WeeklyCheckin> {
  const load = await plannedLoad(studentId);
  const entries = await entriesBetween(studentId, weekStart, addDaysYmd(weekStart, 6));
  const projects: CheckinProjectLine[] = load.map((p) => {
    const minutes = entries.filter((e) => e.opportunityId === p.opportunityId).reduce((sum, e) => sum + e.minutes, 0);
    return { opportunityId: p.opportunityId, title: p.title, plannedHours: p.hoursPerWeek, actualHours: minutes > 0 ? round1(minutes / 60) : p.hoursPerWeek };
  });
  const total = round1(projects.reduce((s, p) => s + p.actualHours, 0));
  const { cap } = capFor(weekStart, limits);
  return { id: "", studentId, weekStart, projects, otherPaidHours: 0, totalHours: total, cap, overCap: total > cap, source: "STUDENT", submittedAt: "", submittedBy: "" };
}

export interface CheckinView {
  weekStart: string;
  /** The saved check-in, or null when it hasn't been filled in. */
  checkin: WeeklyCheckin | null;
  /** What the form starts with. */
  prefill: WeeklyCheckin;
  editable: boolean;
}

export async function getCheckinService(studentId: string, weekStartInput?: string): Promise<CheckinView> {
  const ctx = await weekContext();
  // Default: last week (the Monday check-in looks back); this week is allowed too
  const weekStart = weekStartInput ?? addDaysYmd(ctx.weekStart, -7);
  if (!isMonday(weekStart)) throw httpError("week must be a Monday (YYYY-MM-DD).", 400);
  const oldest = addDaysYmd(ctx.weekStart, -7 * CHECKIN_EDITABLE_WEEKS);
  return {
    weekStart,
    checkin: await findCheckin(studentId, weekStart),
    prefill: await prefill(studentId, weekStart, ctx.limits),
    editable: weekStart <= ctx.weekStart && weekStart >= oldest,
  };
}

export interface CheckinInput {
  projects?: { opportunityId: string; actualHours: number }[];
  otherPaidHours?: number;
  note?: string;
}

/**
 * D10: saves (or corrects) a week's check-in. Going over the cap is recorded and shown to mentors; it never
 * blocks work that is already running.
 */
export async function saveCheckinService(studentId: string, weekStart: string, input: CheckinInput, by: string): Promise<WeeklyCheckin> {
  const ctx = await weekContext();
  if (!isMonday(weekStart)) throw httpError("week must be a Monday (YYYY-MM-DD).", 400);
  if (weekStart > ctx.weekStart) throw httpError("You can't check in for a future week.", 400);
  if (weekStart < addDaysYmd(ctx.weekStart, -7 * CHECKIN_EDITABLE_WEEKS)) throw httpError(`Check-ins can be changed for the last ${CHECKIN_EDITABLE_WEEKS} weeks only.`, 400);

  const validHours = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_WEEK_HOURS;
  const other = input.otherPaidHours ?? 0;
  if (!validHours(other)) throw httpError(`Other paid work must be 0 to ${MAX_WEEK_HOURS} hours.`, 400);
  const lines = Array.isArray(input.projects) ? input.projects : [];
  if (lines.length > 20) throw httpError("Too many project lines.", 400);
  if (lines.some((l) => !l || typeof l.opportunityId !== "string" || !validHours(l.actualHours))) throw httpError(`Each project needs an opportunityId and 0 to ${MAX_WEEK_HOURS} hours.`, 400);

  const form = await prefill(studentId, weekStart, ctx.limits);
  const mine = new Set((await allocationsOfStudent(studentId)).map((a) => a.opportunityId));
  if (lines.some((l) => !mine.has(l.opportunityId))) throw httpError("A project in the check-in isn't allocated to you.", 400);
  const titles = await opportunitiesByIds(lines.map((l) => l.opportunityId));
  const projects: CheckinProjectLine[] = lines.map((l) => ({
    opportunityId: l.opportunityId,
    title: titles.get(l.opportunityId)?.title ?? l.opportunityId,
    plannedHours: form.projects.find((p) => p.opportunityId === l.opportunityId)?.plannedHours ?? 0,
    actualHours: round1(l.actualHours),
  }));
  const total = round1(projects.reduce((s, p) => s + p.actualHours, 0) + other);
  const { cap } = capFor(weekStart, ctx.limits);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 300) : undefined;
  const values = { projects, otherPaidHours: round1(other), totalHours: total, cap, overCap: total > cap, source: "STUDENT" as const, submittedAt: new Date().toISOString(), submittedBy: by, ...(note ? { note } : {}) };

  if (isDbConnected()) {
    const doc = await WeeklyCheckinModel.findOneAndUpdate(
      { studentId, weekStart },
      { $set: values, $setOnInsert: { id: newId("ci"), studentId, weekStart } },
      { new: true, upsert: true }
    ).lean();
    return strip<WeeklyCheckin>(doc);
  }
  const existing = mem.checkins.find((c) => c.studentId === studentId && c.weekStart === weekStart);
  if (existing) return Object.assign(existing, values);
  const created: WeeklyCheckin = { id: newId("ci"), studentId, weekStart, ...values };
  mem.checkins.push(created);
  return created;
}

/**
 * Daily check: a student with live work who didn't check in for last week gets an AUTO check-in with the planned
 * hours, plus one reminder. The unique (student, week) index makes this safe to run any number of times.
 */
export async function autoCheckinsService(now = new Date(), onlyStudentIds?: string[]): Promise<{ created: number }> {
  const ctx = await weekContext(now);
  const lastWeek = addDaysYmd(ctx.weekStart, -7);
  let created = 0;
  for (const student of await activeStudents()) {
    if (onlyStudentIds && !onlyStudentIds.includes(student.id)) continue;
    const live = (await allocationsOfStudent(student.id)).filter(isLive);
    if (live.length === 0 || (await findCheckin(student.id, lastWeek))) continue;
    const form = await prefill(student.id, lastWeek, ctx.limits);
    const projects = form.projects.map((p) => ({ ...p, actualHours: p.plannedHours }));
    const total = round1(projects.reduce((s, p) => s + p.actualHours, 0));
    const doc: WeeklyCheckin = { ...form, id: newId("ci"), projects, totalHours: total, overCap: total > form.cap, source: "AUTO", submittedAt: now.toISOString(), submittedBy: "SYSTEM" };
    try {
      if (isDbConnected()) await WeeklyCheckinModel.create(doc);
      else if (!mem.checkins.some((c) => c.studentId === student.id && c.weekStart === lastWeek)) mem.checkins.push(doc);
      else continue;
    } catch (error: any) {
      if (error?.code === 11000) continue; // another run created it a moment ago
      throw error;
    }
    created++;
    await notifyStudent(
      student.id,
      `Weekly check-in for the week of ${lastWeek}`,
      `You didn't fill in last week's check-in, so your planned hours (${total} h) were recorded. If you worked more or less, or did other paid work, correct it on your dashboard (My week).`
    );
  }
  return { created };
}

/** Check-ins over the cap for a week (shown to mentors and coordinators on the SLA board). */
export async function overCapCheckinsService(weekStart: string): Promise<WeeklyCheckin[]> {
  if (isDbConnected()) return (await WeeklyCheckinModel.find({ weekStart, overCap: true }).lean()).map((c) => strip<WeeklyCheckin>(c));
  return mem.checkins.filter((c) => c.weekStart === weekStart && c.overCap);
}

/** Test/cleanup helper. */
export async function deleteHoursDataForStudents(studentIds: string[]): Promise<void> {
  if (isDbConnected()) {
    await HourEntryModel.deleteMany({ studentId: { $in: studentIds } });
    await WeeklyCheckinModel.deleteMany({ studentId: { $in: studentIds } });
    return;
  }
  mem.entries = mem.entries.filter((e) => !studentIds.includes(e.studentId));
  mem.checkins = mem.checkins.filter((c) => !studentIds.includes(c.studentId));
}

/** Test/cleanup helper: removes specific entries (e.g. hours a test logged for a seeded student). */
export async function deleteHourEntries(ids: string[]): Promise<void> {
  if (isDbConnected()) {
    await HourEntryModel.deleteMany({ id: { $in: ids } });
    return;
  }
  mem.entries = mem.entries.filter((e) => !ids.includes(e.id));
}
