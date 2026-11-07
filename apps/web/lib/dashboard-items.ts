import { tierRankOf, type Allocation, type BlackoutPeriod, type Opportunity, type Tier } from "@edurev/types";
import { formatDate } from "@/lib/format";

/**
 * Pure helpers behind the Phase 3 dashboard (docs/modules/ui-shell.md): the notice line (U5), count labels (U6),
 * deadlines and "opportunities for you" (U8). No fetching here, so the rules are easy to read and change.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A project is "at risk" in its last 48 hours (until Phase 4 brings milestones and the SLA engine). */
export const AT_RISK_HOURS = 48;
/** "Deadline soon" window for projects; bidding closures use the shorter at-risk window. */
export const SOON_DAYS = 7;
/** Upcoming exam blackouts are mentioned this far ahead. */
export const BLACKOUT_LOOKAHEAD_DAYS = 14;

/** U6: "99+" for anything above 99, so badges stay small. */
export function countLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** A date-only value ("2026-09-20") means the end of that day; a date-time is used as is. */
export function toInstant(value: string | undefined): number | null {
  if (!value) return null;
  const time = new Date(value.includes("T") ? value : `${value}T23:59:59`).getTime();
  return Number.isNaN(time) ? null : time;
}

/** "overdue by 2 days", "due in 5 hours", "due today", "due in 3 days". */
export function relativeDue(value: string, now = Date.now(), verb = "due"): string {
  const at = toInstant(value);
  if (at === null) return "";
  const diff = at - now;
  if (diff < 0) {
    const days = Math.floor(-diff / DAY);
    if (days >= 1) return `overdue by ${days} day${days === 1 ? "" : "s"}`;
    const hours = Math.max(1, Math.floor(-diff / HOUR));
    return `overdue by ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return hours < 1 ? `${verb} within the hour` : `${verb} in ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round(diff / DAY);
  return `${verb} in ${days} day${days === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ */
/* Projects                                                           */
/* ------------------------------------------------------------------ */

/** One piece of allocated work for the signed-in student, with the deadline that counts (D6). */
export interface ProjectItem {
  opportunity: Opportunity;
  allocation: Allocation | null;
  /** The agreed deadline (allocation `slaDeadline`), or the client's due date when there is none. */
  dueAt: string;
}

export type DueState = "overdue" | "at-risk" | "soon" | "later";

export function dueState(dueAt: string, now = Date.now()): DueState {
  const at = toInstant(dueAt);
  if (at === null) return "later";
  if (at < now) return "overdue";
  if (at - now <= AT_RISK_HOURS * HOUR) return "at-risk";
  if (at - now <= SOON_DAYS * DAY) return "soon";
  return "later";
}

export const DUE_LABELS: Record<DueState, string> = { overdue: "Overdue", "at-risk": "At risk", soon: "Due soon", later: "On track" };

/** Opportunities allocated to this student, before reading their allocation records. */
export function allocatedTo(opportunities: Opportunity[], studentId: string): Opportunity[] {
  return opportunities.filter((o) => o.status === "ALLOCATED" && o.allocatedStudentId === studentId);
}

/** Keeps work that is still in progress (delivered or cancelled allocations drop out) and sorts by deadline. */
export function activeProjects(opportunities: Opportunity[], allocations: (Allocation | null)[]): ProjectItem[] {
  return opportunities
    .map((opportunity, i) => {
      const allocation = allocations[i] ?? null;
      return { opportunity, allocation, dueAt: allocation?.slaDeadline || opportunity.deadline };
    })
    .filter((item) => !item.allocation || (item.allocation.status !== "COMPLETED" && item.allocation.status !== "CANCELLED"))
    .sort((a, b) => (toInstant(a.dueAt) ?? Infinity) - (toInstant(b.dueAt) ?? Infinity));
}

/* ------------------------------------------------------------------ */
/* Opportunities for you                                              */
/* ------------------------------------------------------------------ */

/** Still taking bids: OPEN or UNDER_REVIEW and before `bidsCloseAt` (the same rule as the API, E2). */
export function isTakingBids(opportunity: Opportunity, now = Date.now()): boolean {
  if (opportunity.status !== "OPEN" && opportunity.status !== "UNDER_REVIEW") return false;
  const closes = toInstant(opportunity.bidsCloseAt);
  return closes === null || closes > now;
}

/**
 * U8 / U11: open work the student's official tier allows, soonest closing first, then newest.
 * Not sorted by the stored `matchScore`, which is a placeholder until the real skill match (F4).
 */
export function opportunitiesFor(opportunities: Opportunity[], tier: Tier, now = Date.now()): Opportunity[] {
  return opportunities
    .filter((o) => isTakingBids(o, now) && tierRankOf(tier) >= tierRankOf(o.requiredTier))
    .sort((a, b) => {
      const ca = toInstant(a.bidsCloseAt) ?? Infinity;
      const cb = toInstant(b.bidsCloseAt) ?? Infinity;
      if (ca !== cb) return ca - cb;
      return (toInstant(b.updatedAt) ?? 0) - (toInstant(a.updatedAt) ?? 0);
    });
}

/* ------------------------------------------------------------------ */
/* Deadlines                                                          */
/* ------------------------------------------------------------------ */

export interface DeadlineItem {
  id: string;
  kind: "Project due" | "Bids close" | "Exam blackout";
  label: string;
  at: string;
  href: string;
  state: DueState;
}

/** U8: what's coming up for a student, soonest first: project deadlines, bid closures and exam blackouts. */
export function deadlinesFor(projects: ProjectItem[], open: Opportunity[], blackouts: BlackoutPeriod[], now = Date.now()): DeadlineItem[] {
  const items: DeadlineItem[] = [
    ...projects.map((p) => ({
      id: `project-${p.opportunity.id}`,
      kind: "Project due" as const,
      label: p.opportunity.project,
      at: p.dueAt,
      href: `/opportunities/${p.opportunity.id}`,
      state: dueState(p.dueAt, now),
    })),
    ...open
      .filter((o) => o.bidsCloseAt)
      .map((o) => ({
        id: `bids-${o.id}`,
        kind: "Bids close" as const,
        label: o.project,
        at: o.bidsCloseAt!,
        href: `/opportunities/${o.id}`,
        state: dueState(o.bidsCloseAt!, now),
      })),
    ...blackouts
      .filter((b) => (toInstant(b.endDate) ?? 0) >= now)
      .map((b) => ({
        id: `blackout-${b.id}`,
        kind: "Exam blackout" as const,
        label: b.title,
        at: b.startDate,
        href: "/safeguards",
        state: "later" as DueState,
      })),
  ];
  return items.sort((a, b) => (toInstant(a.at) ?? Infinity) - (toInstant(b.at) ?? Infinity));
}

/* ------------------------------------------------------------------ */
/* Notice line (U5)                                                   */
/* ------------------------------------------------------------------ */

export type NoticeLevel = "overdue" | "at-risk" | "soon" | "blackout";

export interface Notice {
  id: string;
  level: NoticeLevel;
  text: string;
  href: string;
  cta: string;
  /** Used to order notices of the same level: the earliest comes first. */
  at?: string;
}

/** Overdue > at risk > deadline soon > exam blackout. */
const NOTICE_RANK: Record<NoticeLevel, number> = { overdue: 0, "at-risk": 1, soon: 2, blackout: 3 };

export const NOTICE_LABELS: Record<NoticeLevel, string> = { overdue: "Overdue", "at-risk": "At risk", soon: "Deadline soon", blackout: "Exam blackout" };

/** The single most urgent notice, plus how many others are waiting. Equal urgency: the earliest date wins. */
export function pickNotice(candidates: Notice[]): { top: Notice | null; more: number } {
  if (candidates.length === 0) return { top: null, more: 0 };
  const sorted = [...candidates].sort(
    (a, b) => NOTICE_RANK[a.level] - NOTICE_RANK[b.level] || (toInstant(a.at) ?? Infinity) - (toInstant(b.at) ?? Infinity) || a.id.localeCompare(b.id)
  );
  return { top: sorted[0], more: sorted.length - 1 };
}

/** A student's candidates: their projects, bids closing soon on work they can take, and exam blackouts. */
export function studentNotices(projects: ProjectItem[], open: Opportunity[], blackouts: BlackoutPeriod[], now = Date.now()): Notice[] {
  const notices: Notice[] = [];
  for (const p of projects) {
    const state = dueState(p.dueAt, now);
    if (state === "later") continue;
    notices.push({
      id: `project-${p.opportunity.id}`,
      level: state,
      text:
        state === "overdue"
          ? `“${p.opportunity.project}” is ${relativeDue(p.dueAt, now)}. Deliver it or ask your coordinator about the deadline.`
          : `“${p.opportunity.project}” is ${relativeDue(p.dueAt, now)} (${formatDate(p.dueAt)}).`,
      href: `/opportunities/${p.opportunity.id}`,
      cta: "Open project",
      at: p.dueAt,
    });
  }
  for (const o of open) {
    const closes = toInstant(o.bidsCloseAt);
    if (closes === null || closes <= now || closes - now > AT_RISK_HOURS * HOUR) continue;
    notices.push({
      id: `bids-${o.id}`,
      level: "soon",
      text: `Bidding on “${o.project}” closes ${relativeDue(o.bidsCloseAt!, now, "").trim()}.`,
      href: `/opportunities/${o.id}`,
      cta: "Place a bid",
      at: o.bidsCloseAt,
    });
  }
  for (const b of blackouts) {
    const start = toInstant(b.startDate);
    const end = toInstant(b.endDate);
    if (start === null || end === null || end < now) continue;
    const active = start - DAY < now; // a date-only start counts from the beginning of that day
    if (!active && start - now > BLACKOUT_LOOKAHEAD_DAYS * DAY) continue;
    notices.push({
      id: `blackout-${b.id}`,
      level: "blackout",
      text: active
        ? `${b.title}: exam blackout until ${formatDate(b.endDate)}. No new allocations until then.`
        : `Exam blackout “${b.title}” starts ${formatDate(b.startDate)}. No new allocations during it.`,
      href: "/safeguards",
      cta: "See safeguards",
      at: b.startDate,
    });
  }
  return notices;
}

/** Staff who allocate: bids waiting for a decision when bidding has closed or closes within 48 hours (G11 preview). */
export function staffNotices(reviewOpportunities: Opportunity[], now = Date.now()): Notice[] {
  const notices: Notice[] = [];
  for (const o of reviewOpportunities) {
    const closes = toInstant(o.bidsCloseAt);
    if (closes === null) continue;
    const bids = `${o.numberOfBids} bid${o.numberOfBids === 1 ? "" : "s"}`;
    if (closes <= now) {
      notices.push({ id: `decide-${o.id}`, level: "overdue", text: `Bidding on “${o.project}” closed ${formatDate(o.bidsCloseAt!)}: ${bids} waiting for a decision.`, href: `/opportunities/${o.id}`, cta: "Review bids", at: o.bidsCloseAt });
    } else if (closes - now <= AT_RISK_HOURS * HOUR) {
      notices.push({ id: `decide-${o.id}`, level: "soon", text: `Bidding on “${o.project}” closes ${relativeDue(o.bidsCloseAt!, now, "").trim()}: ${bids} so far.`, href: `/opportunities/${o.id}`, cta: "Review bids", at: o.bidsCloseAt });
    }
  }
  return notices;
}
