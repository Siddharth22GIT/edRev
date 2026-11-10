import type { Role, Tier } from "./index";
import { tierRankOf, TIER_INFO } from "./tiers";

// Phase 4 (F1): the safeguards engine. Single source of truth for the limits (decisions D1–D5, D10) and for the
// pure rule check. The API gathers the facts (records, hours, projects) and calls `evaluateSafeguards`; the web
// app uses the same labels and helpers to explain a result. Doc: docs/modules/safeguards.md

/** A named date range (YYYY-MM-DD, inclusive), e.g. a semester break. */
export interface DateRange {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
}

/** Every limit an Administrator can change on Institutional settings (G1). Defaults = the agreed decisions. */
export interface SafeguardLimits {
  /** D1: weekly hour cap during term. */
  termHoursCap: number;
  /** D1: weekly hour cap during breaks (the `breakPeriods`). */
  breakHoursCap: number;
  /** D1: when the break cap applies. Empty = term all year. */
  breakPeriods: DateRange[];
  /** D2: minimum attendance (%) once attendance is recorded. */
  attendanceMin: number;
  /** D3: active projects a student may have at once, per official tier. */
  parallelProjects: Record<Tier, number>;
  /** D4: extensions per project. */
  extensionMaxPerProject: number;
  /** D4: an extension may add at most this % of the original duration. */
  extensionMaxPercent: number;
  /** D5: this many overdue projects… */
  cooldownOverdueCount: number;
  /** D5: …within this many days… */
  cooldownWindowDays: number;
  /** D5: …blocks new allocations for this many days. */
  cooldownDays: number;
  /** G4: new allocations stop this many days before an exam blackout starts. */
  blackoutBufferDays: number;
  /** G10: the student kicks off allocated work within this many hours. */
  kickoffHours: number;
  /** F2b: revision rounds included; more need a Cell Coordinator or Administrator. */
  revisionRounds: number;
  /** Help requests: staff reply within this many working days… */
  helpReplyWorkingDays: number;
  /** …and an unanswered request escalates after this many working days. */
  helpEscalateWorkingDays: number;
  /** G11: staff service levels, in working days. */
  signupReviewDays: number;
  earningVerifyDays: number;
}

export const DEFAULT_SAFEGUARD_LIMITS: SafeguardLimits = {
  termHoursCap: 10,
  breakHoursCap: 20,
  breakPeriods: [],
  attendanceMin: 75,
  parallelProjects: { TIER_1: 1, TIER_2: 1, TIER_3: 2, TIER_4: 3 },
  extensionMaxPerProject: 1,
  extensionMaxPercent: 30,
  cooldownOverdueCount: 2,
  cooldownWindowDays: 60,
  cooldownDays: 14,
  blackoutBufferDays: 2,
  kickoffHours: 24,
  revisionRounds: 2,
  helpReplyWorkingDays: 1,
  helpEscalateWorkingDays: 2,
  signupReviewDays: 2,
  earningVerifyDays: 5,
};

/** Allowed range for each number an Administrator can set (G1: nonsense limits are refused). */
export const SAFEGUARD_LIMIT_RANGES: Record<Exclude<keyof SafeguardLimits, "breakPeriods" | "parallelProjects">, [number, number]> = {
  termHoursCap: [1, 40],
  breakHoursCap: [1, 40],
  attendanceMin: [0, 100],
  extensionMaxPerProject: [0, 5],
  extensionMaxPercent: [0, 100],
  cooldownOverdueCount: [1, 10],
  cooldownWindowDays: [1, 365],
  cooldownDays: [0, 90],
  blackoutBufferDays: [0, 30],
  kickoffHours: [1, 168],
  revisionRounds: [0, 10],
  helpReplyWorkingDays: [1, 10],
  helpEscalateWorkingDays: [1, 20],
  signupReviewDays: [1, 30],
  earningVerifyDays: [1, 30],
};
/** D3: parallel projects per tier may be 1 to 10. */
export const PARALLEL_PROJECTS_RANGE: [number, number] = [1, 10];

/* ------------------------------------------------------------------------------------------------ */
/* Rules                                                                                            */
/* ------------------------------------------------------------------------------------------------ */

export type SafeguardRuleId = "TIER" | "CGPA_RECORDED" | "CGPA" | "ATTENDANCE" | "COMPLIANCE" | "BLACKOUT" | "HOURS" | "PARALLEL" | "COOLDOWN";

export interface SafeguardRuleInfo {
  label: string;
  /** Hard rules can never be overridden. Soft rules can, with a reason and an expiry (G5). */
  hard: boolean;
  /** Who can help when this rule blocks a student (where "Request help" goes first). */
  helpFrom: Role;
  /** What the rule protects, in one line (Safeguards page). */
  description: string;
}

export const SAFEGUARD_RULES: Record<SafeguardRuleId, SafeguardRuleInfo> = {
  TIER: { label: "Tier", hard: true, helpFrom: "ADMINISTRATOR", description: "Work is offered only to students whose official tier is high enough." },
  CGPA_RECORDED: { label: "Official CGPA recorded", hard: false, helpFrom: "FACULTY_DIRECTOR", description: "No allocation until a Faculty Director records the official CGPA." },
  CGPA: { label: "CGPA", hard: true, helpFrom: "FACULTY_DIRECTOR", description: "Studies come first: the official CGPA must meet the required minimum." },
  ATTENDANCE: { label: "Attendance", hard: false, helpFrom: "FACULTY_DIRECTOR", description: "Attendance must stay at or above the minimum once it is recorded." },
  COMPLIANCE: { label: "Compliance", hard: false, helpFrom: "FACULTY_DIRECTOR", description: "Required paperwork and conduct checks must be complete." },
  BLACKOUT: { label: "Exam blackout", hard: true, helpFrom: "FACULTY_DIRECTOR", description: "No new work during exams or the days just before them." },
  HOURS: { label: "Weekly hours", hard: false, helpFrom: "GUILD_LEAD", description: "Planned work must fit inside the weekly hour cap." },
  PARALLEL: { label: "Projects at once", hard: true, helpFrom: "CELL_COORDINATOR", description: "A limit on how many projects a student runs at the same time, by tier." },
  COOLDOWN: { label: "Reliability cool-down", hard: false, helpFrom: "CELL_COORDINATOR", description: "Repeated overdue work pauses new allocations for a while." },
};

/** Most important first when several rules fail (G6). */
export const SAFEGUARD_RULE_ORDER: SafeguardRuleId[] = ["TIER", "CGPA", "BLACKOUT", "PARALLEL", "CGPA_RECORDED", "ATTENDANCE", "COMPLIANCE", "HOURS", "COOLDOWN"];

export function isHardRule(rule: SafeguardRuleId): boolean {
  return SAFEGUARD_RULES[rule]?.hard ?? true;
}

export type RuleOutcome = "PASS" | "WARN" | "BLOCK";

/** A staff override of a soft rule for one student (G5). Logged; ends at `expiresAt` or when revoked. */
export interface SafeguardOverride {
  id: string;
  studentId: string;
  rule: SafeguardRuleId;
  reason: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  revokedBy?: string;
}

export interface SafeguardRuleResult {
  rule: SafeguardRuleId;
  label: string;
  outcome: RuleOutcome;
  hard: boolean;
  /** What is wrong (or fine), in plain words. */
  message: string;
  /** G6: what unlocks it. */
  unlock?: string;
  /** Who can help (the first stop for "Request help"). */
  helpFrom?: Role;
  /** Set when a soft rule would block but an active override lets it pass. */
  override?: Pick<SafeguardOverride, "id" | "reason" | "createdBy" | "expiresAt">;
}

/** One active project's share of the week (D10). */
export interface WeeklyProjectLoad {
  opportunityId: string;
  title: string;
  hoursPerWeek: number;
}

/** D10: the week's hours as the engine sees them. */
export interface WeeklyHoursSummary {
  studentId: string;
  /** Monday of the week (YYYY-MM-DD, institution timezone). */
  weekStart: string;
  cap: number;
  capKind: "TERM" | "BREAK";
  /** Planned hours of active projects this week. */
  plannedProjectHours: number;
  /** Outside paid work from the latest check-in (counts toward the cap). */
  otherPaidHours: number;
  /** planned + other paid. */
  usedHours: number;
  remainingHours: number;
  projects: WeeklyProjectLoad[];
  /** Hours/week the opportunity being checked would add. */
  candidateHours?: number;
  /** Hours actually recorded this week so far (timer + manual entries). */
  recordedHours?: number;
}

/** The facts the rule check needs. The API collects them from MongoDB or demo data. */
export interface SafeguardFacts {
  now: Date;
  limits: SafeguardLimits;
  tier: Tier;
  /** Set when checking a specific opportunity. */
  requiredTier?: Tier;
  academic: {
    /** False until a Faculty Director records the official CGPA. */
    recorded: boolean;
    cgpa: number;
    requiredCgpa: number;
    complianceStatus: "COMPLIANT" | "WARNING" | "NON_COMPLIANT";
    attendancePercent?: number;
    activeBacklogs?: number;
  } | null;
  /** An exam blackout in force now (including the buffer days before it). */
  blackoutNow: { title: string; startDate: string; endDate: string; inBuffer: boolean } | null;
  /** A blackout that falls inside the candidate project's dates (a warning, never a block). */
  blackoutInProject: { title: string; startDate: string; endDate: string } | null;
  hours: WeeklyHoursSummary;
  /** Staff marked this week's hour log BLOCKED (pre-Phase 4 record) and nobody overrode it. */
  legacyHoursBlocked: boolean;
  activeProjects: number;
  /** D5: end of an active cool-down, if any. */
  cooldownUntil: string | null;
  overrides: SafeguardOverride[];
}

const tierLabel = (tier: Tier) => `${tier.replace("_", " ")} (${TIER_INFO[tier]?.name ?? tier})`;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Active = not revoked and not expired at `now`. */
export function isOverrideActive(override: SafeguardOverride, now: Date): boolean {
  return !override.revokedAt && new Date(override.expiresAt).getTime() > now.getTime();
}

/**
 * G1–G6: checks every rule and returns the results most important first: hard blocks, soft blocks, warnings,
 * then passes. A soft block with an active override passes and says so.
 */
export function evaluateSafeguards(f: SafeguardFacts): SafeguardRuleResult[] {
  const results: SafeguardRuleResult[] = [];
  const add = (rule: SafeguardRuleId, outcome: RuleOutcome, message: string, unlock?: string) => {
    const info = SAFEGUARD_RULES[rule];
    results.push({ rule, label: info.label, outcome, hard: info.hard, message, ...(unlock ? { unlock } : {}), ...(outcome !== "PASS" ? { helpFrom: info.helpFrom } : {}) });
  };

  // Tier (only when checking a specific opportunity)
  if (f.requiredTier) {
    if (tierRankOf(f.tier) < tierRankOf(f.requiredTier)) {
      add("TIER", "BLOCK", `This work needs ${tierLabel(f.requiredTier)}; your official tier is ${tierLabel(f.tier)}.`, "Tiers change only when an Administrator approves. Training, skills and on-time delivery build the record for the next tier.");
    } else add("TIER", "PASS", `${tierLabel(f.tier)} meets the ${tierLabel(f.requiredTier)} requirement.`);
  }

  // Academic record
  const a = f.academic;
  if (!a || !a.recorded) {
    add("CGPA_RECORDED", "BLOCK", "Your official CGPA hasn't been recorded yet.", "A Faculty Director records it from the academic record. Ask them if it's taking long.");
  } else {
    add("CGPA_RECORDED", "PASS", "Official CGPA is on record.");
    if (a.cgpa < a.requiredCgpa) {
      add("CGPA", "BLOCK", `Official CGPA ${a.cgpa.toFixed(2)} is below the required ${a.requiredCgpa.toFixed(2)}.`, "Raise the official CGPA to the required level. Current projects can be finished; new ones wait.");
    } else add("CGPA", "PASS", `Official CGPA ${a.cgpa.toFixed(2)} meets the required ${a.requiredCgpa.toFixed(2)}.`);

    if (a.attendancePercent === undefined || a.attendancePercent === null) {
      add("ATTENDANCE", "WARN", "Attendance hasn't been recorded yet.", "A Faculty Director records attendance. Missing attendance never counts as a pass in reports.");
    } else if (a.attendancePercent < f.limits.attendanceMin) {
      add("ATTENDANCE", "BLOCK", `Attendance ${fmt(a.attendancePercent)}% is below the ${f.limits.attendanceMin}% minimum.`, `Bring attendance back to ${f.limits.attendanceMin}% or more, then ask the Faculty Director to update the record.`);
    } else add("ATTENDANCE", "PASS", `Attendance ${fmt(a.attendancePercent)}% meets the ${f.limits.attendanceMin}% minimum.`);

    if (a.complianceStatus === "NON_COMPLIANT") {
      add("COMPLIANCE", "BLOCK", "Compliance requirements are incomplete.", "Complete the missing paperwork or checks with the Faculty Director.");
    } else if (a.complianceStatus === "WARNING") {
      add("COMPLIANCE", "WARN", "Some compliance items need attention.", "Check with the Faculty Director before it becomes a block.");
    } else add("COMPLIANCE", "PASS", "Compliance is complete.");
    if (a.activeBacklogs && a.activeBacklogs > 0) {
      results.push({ rule: "COMPLIANCE", label: "Backlogs", outcome: "WARN", hard: false, message: `${a.activeBacklogs} active backlog${a.activeBacklogs === 1 ? "" : "s"} on record.`, unlock: "Clearing backlogs keeps your academic record strong.", helpFrom: "FACULTY_DIRECTOR" });
    }
  }

  // Exam blackout
  if (f.blackoutNow) {
    const b = f.blackoutNow;
    add(
      "BLACKOUT",
      "BLOCK",
      b.inBuffer ? `${b.title} starts ${b.startDate}. New work stops ${f.limits.blackoutBufferDays} day${f.limits.blackoutBufferDays === 1 ? "" : "s"} before exams.` : `${b.title}: exam blackout until ${b.endDate}.`,
      `New allocations open again after ${b.endDate}. Current projects continue.`
    );
  } else if (f.blackoutInProject) {
    const b = f.blackoutInProject;
    add("BLACKOUT", "WARN", `${b.title} (${b.startDate} to ${b.endDate}) falls inside this project's dates.`, "Plan to finish before the exams, or agree a pause for the exam days.");
  } else add("BLACKOUT", "PASS", "No exam blackout now.");

  // Weekly hours (D10): planned hours of active projects + outside paid work + this project ≤ cap
  const h = f.hours;
  const total = h.usedHours + (h.candidateHours ?? 0);
  const capText = `${fmt(h.cap)} h ${h.capKind === "BREAK" ? "break" : "term"} cap`;
  if (f.legacyHoursBlocked) {
    add("HOURS", "BLOCK", "Staff marked this week's hours as full.", "A Faculty Director or Cell Coordinator can override the hour cap with a reason.");
  } else if (total > h.cap) {
    const parts = [`${fmt(h.plannedProjectHours)} h planned`];
    if (h.otherPaidHours) parts.push(`${fmt(h.otherPaidHours)} h other paid work`);
    if (h.candidateHours) parts.push(`${fmt(h.candidateHours)} h/week for this project`);
    add("HOURS", "BLOCK", `${parts.join(" + ")} = ${fmt(total)} h, over the ${capText}.`, h.candidateHours ? "You can take it when a current project finishes, or ask your mentor about the weekly hours." : "Finish a current project first, or ask your mentor about the weekly hours.");
  } else if (h.candidateHours !== undefined) {
    add("HOURS", "PASS", `${fmt(total)} h of the ${capText} with this project.`);
  } else add("HOURS", "PASS", `${fmt(h.usedHours)} h of the ${capText} planned this week.`);

  // Projects at once (D3)
  const limit = f.limits.parallelProjects[f.tier] ?? 1;
  if (f.activeProjects >= limit) {
    add("PARALLEL", "BLOCK", `${f.activeProjects} active project${f.activeProjects === 1 ? "" : "s"}; ${tierLabel(f.tier)} allows ${limit} at a time.`, "Deliver a current project first. Higher tiers may run more projects at once.");
  } else add("PARALLEL", "PASS", `${f.activeProjects} of ${limit} project${limit === 1 ? "" : "s"} at once.`);

  // Reliability cool-down (D5)
  if (f.cooldownUntil && new Date(f.cooldownUntil).getTime() > f.now.getTime()) {
    add("COOLDOWN", "BLOCK", `${f.limits.cooldownOverdueCount} overdue projects within ${f.limits.cooldownWindowDays} days: new allocations pause until ${f.cooldownUntil.slice(0, 10)}.`, "It ends by itself on that date. A Cell Coordinator can lift it early with a reason.");
  } else add("COOLDOWN", "PASS", "No cool-down.");

  // Overrides turn soft blocks into passes (never hard ones)
  for (const r of results) {
    if (r.outcome !== "BLOCK" || r.hard) continue;
    const o = f.overrides.find((x) => x.rule === r.rule && isOverrideActive(x, f.now));
    if (o) {
      r.outcome = "PASS";
      r.message = `${r.message} Overridden until ${o.expiresAt.slice(0, 10)}: ${o.reason}`;
      r.override = { id: o.id, reason: o.reason, createdBy: o.createdBy, expiresAt: o.expiresAt };
    }
  }

  const rank = (r: SafeguardRuleResult) => (r.outcome === "BLOCK" ? (r.hard ? 0 : 1) : r.outcome === "WARN" ? 2 : 3);
  return results
    .map((r, i) => ({ r, i }))
    .sort((x, y) => rank(x.r) - rank(y.r) || SAFEGUARD_RULE_ORDER.indexOf(x.r.rule) - SAFEGUARD_RULE_ORDER.indexOf(y.r.rule) || x.i - y.i)
    .map((x) => x.r);
}

/* ------------------------------------------------------------------------------------------------ */
/* Helpers shared by the API and the web app                                                        */
/* ------------------------------------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

/**
 * D10: a project's hours spread over its weeks. `estimatedHours` ÷ weeks from start to due (at least 1 week).
 * Example: 24 h over 3 weeks = 8 h/week; 5 h due in 2 days = 5 h/week.
 */
export function hoursPerWeek(estimatedHours: number, start: Date, due: Date | null): number {
  const hours = Number.isFinite(estimatedHours) && estimatedHours > 0 ? estimatedHours : 0;
  if (!due) return Math.round(hours * 10) / 10;
  const weeks = Math.max(1, Math.ceil((due.getTime() - start.getTime()) / (7 * DAY_MS)));
  return Math.round((hours / weeks) * 10) / 10;
}

/**
 * D5: the end of the cool-down, or null. Looks for the latest overdue event that has `count - 1` other overdue
 * events in the `windowDays` before it; the cool-down lasts `cooldownDays` from that event.
 */
export function cooldownUntil(overdueAt: string[], limits: Pick<SafeguardLimits, "cooldownOverdueCount" | "cooldownWindowDays" | "cooldownDays">, now: Date): string | null {
  const times = overdueAt.map((t) => new Date(t).getTime()).filter((t) => Number.isFinite(t) && t <= now.getTime()).sort((a, b) => a - b);
  for (let j = times.length - 1; j >= 0; j--) {
    const inWindow = times.filter((t) => t <= times[j] && t > times[j] - limits.cooldownWindowDays * DAY_MS).length;
    if (inWindow >= limits.cooldownOverdueCount) {
      const until = times[j] + limits.cooldownDays * DAY_MS;
      return until > now.getTime() ? new Date(until).toISOString() : null;
    }
  }
  return null;
}

/** True when `ymd` (YYYY-MM-DD) is inside one of the ranges (inclusive). */
export function inDateRanges(ymd: string, ranges: DateRange[]): DateRange | null {
  return ranges.find((r) => r.startDate <= ymd && ymd <= r.endDate) ?? null;
}

/** Adds days to a YYYY-MM-DD date (calendar arithmetic, timezone-free). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD) of the week that contains `ymd`. Weeks run Monday to Sunday (D10). */
export function weekStartOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDaysYmd(ymd, day === 0 ? -6 : 1 - day);
}

/** Working days (Monday–Friday) between two instants, counting whole days only. */
export function workingDaysBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  let count = 0;
  const cursor = new Date(from.getTime());
  while (cursor.getTime() + DAY_MS <= to.getTime()) {
    cursor.setTime(cursor.getTime() + DAY_MS);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/** True when every value is a number inside its range and the parallel limits make sense (G1). */
export function safeguardLimitProblems(limits: Partial<SafeguardLimits>): string[] {
  const problems: string[] = [];
  for (const [key, [min, max]] of Object.entries(SAFEGUARD_LIMIT_RANGES)) {
    const value = (limits as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) problems.push(`${key} must be a number from ${min} to ${max}.`);
  }
  if (limits.parallelProjects !== undefined) {
    const p = limits.parallelProjects as Record<string, unknown>;
    const tiers: Tier[] = ["TIER_1", "TIER_2", "TIER_3", "TIER_4"];
    if (!p || typeof p !== "object" || tiers.some((t) => !Number.isInteger(p[t]) || (p[t] as number) < PARALLEL_PROJECTS_RANGE[0] || (p[t] as number) > PARALLEL_PROJECTS_RANGE[1])) {
      problems.push(`parallelProjects needs a whole number from ${PARALLEL_PROJECTS_RANGE[0]} to ${PARALLEL_PROJECTS_RANGE[1]} for each tier.`);
    } else if (tiers.some((t, i) => i > 0 && (p[t] as number) < (p[tiers[i - 1]] as number))) {
      problems.push("parallelProjects can't allow fewer projects for a higher tier.");
    }
  }
  if (limits.breakPeriods !== undefined) {
    const list = limits.breakPeriods as unknown;
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (!Array.isArray(list) || list.length > 20 || list.some((r: any) => !r || typeof r.title !== "string" || !r.title.trim() || !ymd.test(r.startDate) || !ymd.test(r.endDate) || r.startDate > r.endDate)) {
      problems.push("breakPeriods must be up to 20 ranges with a title and a start date on or before the end date (YYYY-MM-DD).");
    }
  }
  return problems;
}

/* ------------------------------------------------------------------------------------------------ */
/* Weekly hours records (D10, G2)                                                                    */
/* ------------------------------------------------------------------------------------------------ */

/** Recorded work time: from the per-project Start/Stop timer or typed in by hand. */
export interface HourEntry {
  id: string;
  studentId: string;
  opportunityId?: string;
  /** Calendar day the work happened (YYYY-MM-DD, institution timezone). */
  date: string;
  minutes: number;
  source: "TIMER" | "MANUAL";
  startedAt?: string;
  /** Unset while the timer is running. */
  endedAt?: string;
  note?: string;
  /** True only while the timer runs (a unique index allows one running timer per student). */
  running?: boolean;
  /** The timer ran longer than the maximum and was cut (a forgotten timer). */
  capped?: boolean;
  createdBy: string;
  createdAt: string;
}

/** One project line in a weekly check-in. */
export interface CheckinProjectLine {
  opportunityId: string;
  title: string;
  plannedHours: number;
  actualHours: number;
}

/** D10: the Monday check-in for one week, pre-filled with the plan and corrected by the student. */
export interface WeeklyCheckin {
  id: string;
  studentId: string;
  /** Monday of the week it describes (YYYY-MM-DD). */
  weekStart: string;
  projects: CheckinProjectLine[];
  /** Outside paid work (Upwork etc.). Counts toward the cap. */
  otherPaidHours: number;
  totalHours: number;
  cap: number;
  overCap: boolean;
  note?: string;
  /** STUDENT = filled in; AUTO = missed, so the planned hours were used. */
  source: "STUDENT" | "AUTO";
  submittedAt: string;
  submittedBy: string;
}

/* ------------------------------------------------------------------------------------------------ */
/* Request help (G6)                                                                                 */
/* ------------------------------------------------------------------------------------------------ */

export type HelpRequestStatus = "OPEN" | "RESOLVED";

/** A blocked student asks for help with one rule. It opens a private Messages thread with the right staff role. */
export interface HelpRequest {
  id: string;
  studentId: string;
  studentName: string;
  rule: SafeguardRuleId;
  /** The block reason at the moment the student asked. */
  reason: string;
  opportunityId?: string;
  conversationId: string;
  /** The role that owns it now (moves up on escalation). */
  routedRole: Role;
  routedUserId: string;
  routedUserName: string;
  /** 0 = first stop, 1 = Cell Coordinator, 2 = Administrator. */
  escalationLevel: number;
  status: HelpRequestStatus;
  createdAt: string;
  escalatedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  /** What was decided, in one line (logged). */
  outcome?: string;
}
