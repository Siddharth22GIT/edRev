import type { Allocation } from "./index";

// Phase 4 (F2, F3): delivery milestones, submissions, extensions and the SLA status. The status is worked out
// on read from the allocation (G9), so it never goes stale and needs no background job to stay correct.
// Doc: docs/modules/sla-and-delivery.md

/** F2a: one step of the work, created from the opportunity's deliverables at allocation. */
export interface Milestone {
  id: string;
  title: string;
  doneAt?: string;
}

export type SubmissionDecision = "ACCEPTED" | "REVISION_REQUESTED";

/** F2b: the student hands in the work (a link and/or a PDF). Staff accept it or ask for a revision. */
export interface DeliverySubmission {
  id: string;
  /** 1 for the first hand-in, 2 after the first revision, … */
  round: number;
  link?: string;
  fileName?: string;
  /** PDF as a data URL (validated by its bytes). Never returned in lists; downloaded separately. */
  fileUrl?: string;
  note?: string;
  submittedAt: string;
  decision?: SubmissionDecision;
  decidedBy?: string;
  decidedAt?: string;
  feedback?: string;
}

export type ExtensionStatus = "PENDING" | "APPROVED" | "REJECTED";

/** G10 / D4: the student asks for more time before the deadline; a Cell Coordinator or Administrator decides. */
export interface ExtensionRequest {
  id: string;
  days: number;
  reason: string;
  requestedAt: string;
  status: ExtensionStatus;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
  /** The agreed deadline after approval. */
  newDeadline?: string;
}

/** G10: work paused for exams or approved leave. The deadline moves by the paused time on resume. */
export interface SlaPause {
  from: string;
  to?: string;
  reason: string;
  by: string;
}

/** A student asks to hand the work back (illness, overload). A coordinator then reassigns it; not counted as late. */
export interface HandBackRequest {
  requestedAt: string;
  reason: string;
}

export type SlaState = "NOT_STARTED" | "ON_TRACK" | "AT_RISK" | "OVERDUE" | "PAUSED" | "SUBMITTED" | "COMPLETED_ON_TIME" | "COMPLETED_LATE" | "CANCELLED";

export const SLA_STATE_LABELS: Record<SlaState, string> = {
  NOT_STARTED: "Not started",
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  OVERDUE: "Overdue",
  PAUSED: "Paused",
  SUBMITTED: "Submitted",
  COMPLETED_ON_TIME: "Delivered on time",
  COMPLETED_LATE: "Delivered late",
  CANCELLED: "Cancelled",
};

/** G9: the computed SLA picture of one allocation. */
export interface SlaView {
  state: SlaState;
  label: string;
  /** Why it is at risk / overdue / waiting (empty when on track). */
  reasons: string[];
  /** The agreed deadline that counts (after approved extensions and pauses). */
  dueAt: string | null;
  /** Kick-off is expected by this time; null once kicked off. */
  kickoffDueAt: string | null;
  /** % of the time between allocation and the deadline that has passed (0–100). */
  timeUsedPercent: number;
  milestonesDone: number;
  milestonesTotal: number;
  /** The latest sign of work: kick-off, a milestone, a submission or recorded hours. */
  lastActivityAt: string | null;
  /** Hours until the deadline (negative when overdue). */
  hoursLeft: number | null;
  /** A submission is waiting for staff (accept or revision). */
  awaitingReview: boolean;
  revisionsUsed: number;
}

/** The allocation fields Phase 4 adds (all optional, so older records keep working). */
export interface AllocationSlaFields {
  milestones?: Milestone[];
  kickoffAt?: string;
  submissions?: DeliverySubmission[];
  extensions?: ExtensionRequest[];
  pauses?: SlaPause[];
  /** The deadline fixed at allocation, before extensions or pauses moved it. */
  originalSlaDeadline?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
  handBack?: HandBackRequest;
  /** Latest recorded hours on this project (timer or manual), kept for the "idle" check. */
  lastHoursAt?: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** At risk when less than this is left and nothing is submitted. */
export const SLA_AT_RISK_HOURS = 48;
/** At risk when there's no sign of work for this many days. */
export const SLA_IDLE_DAYS = 3;
/** At risk when the share of time used is ahead of the share of milestones done by more than this. */
export const SLA_MILESTONE_LAG_PERCENT = 25;

const latest = (values: (string | undefined | null)[]): string | null =>
  values.filter((v): v is string => Boolean(v)).sort().at(-1) ?? null;

/**
 * G9: works out the SLA state of an allocation at `now`. Rules, in order:
 * cancelled → completed (on time / late) → paused (wins over overdue) → overdue → submitted (waiting for staff)
 * → at risk (kick-off missed, < 48 h left with nothing submitted, 3 idle days, time used ahead of milestones)
 * → not started (before kick-off) → on track.
 */
export function computeSla(allocation: Allocation & AllocationSlaFields, now: Date, kickoffHours = 24): SlaView {
  const milestones = allocation.milestones ?? [];
  const submissions = allocation.submissions ?? [];
  const done = milestones.filter((m) => m.doneAt).length;
  const due = allocation.slaDeadline ? new Date(allocation.slaDeadline) : null;
  const start = new Date(allocation.slaStartAt || allocation.allocatedAt);
  const lastSubmission = submissions.at(-1);
  const awaitingReview = Boolean(lastSubmission && !lastSubmission.decision);
  const revisionsUsed = submissions.filter((s) => s.decision === "REVISION_REQUESTED").length;
  const lastActivityAt = latest([allocation.kickoffAt, allocation.lastHoursAt, ...milestones.map((m) => m.doneAt), ...submissions.map((s) => s.submittedAt)]);
  const kickoffDue = new Date(start.getTime() + kickoffHours * HOUR_MS);

  const total = due ? due.getTime() - start.getTime() : 0;
  const timeUsedPercent = due && total > 0 ? Math.max(0, Math.min(100, Math.round(((now.getTime() - start.getTime()) / total) * 100))) : 0;
  const hoursLeft = due ? Math.round((due.getTime() - now.getTime()) / HOUR_MS) : null;

  const view = (state: SlaState, reasons: string[] = []): SlaView => ({
    state,
    label: SLA_STATE_LABELS[state],
    reasons,
    dueAt: due ? due.toISOString() : null,
    kickoffDueAt: allocation.kickoffAt || allocation.status === "COMPLETED" || allocation.status === "CANCELLED" ? null : kickoffDue.toISOString(),
    timeUsedPercent,
    milestonesDone: done,
    milestonesTotal: milestones.length,
    lastActivityAt,
    hoursLeft,
    awaitingReview,
    revisionsUsed,
  });

  if (allocation.status === "CANCELLED") return view("CANCELLED", allocation.cancelReason ? [allocation.cancelReason] : []);
  if (allocation.status === "COMPLETED") return view(allocation.onTime === false ? "COMPLETED_LATE" : "COMPLETED_ON_TIME");

  const openPause = (allocation.pauses ?? []).find((p) => !p.to);
  if (openPause) return view("PAUSED", [`Paused: ${openPause.reason}`]);

  if (due && now.getTime() > due.getTime()) {
    const days = Math.floor((now.getTime() - due.getTime()) / DAY_MS);
    return view("OVERDUE", [days >= 1 ? `Overdue by ${days} day${days === 1 ? "" : "s"}.` : "The deadline has passed."]);
  }

  if (awaitingReview) return view("SUBMITTED", ["Waiting for staff to accept the work or ask for a revision."]);

  const reasons: string[] = [];
  if (!allocation.kickoffAt && now.getTime() > kickoffDue.getTime()) reasons.push(`Not kicked off within ${kickoffHours} hours.`);
  if (due && due.getTime() - now.getTime() <= SLA_AT_RISK_HOURS * HOUR_MS) reasons.push(`Less than ${SLA_AT_RISK_HOURS} hours left and nothing submitted.`);
  const idleSince = lastActivityAt ? new Date(lastActivityAt) : allocation.kickoffAt ? new Date(allocation.kickoffAt) : null;
  if (idleSince && now.getTime() - idleSince.getTime() >= SLA_IDLE_DAYS * DAY_MS) reasons.push(`No activity for ${SLA_IDLE_DAYS}+ days.`);
  if (milestones.length > 0) {
    const donePercent = Math.round((done / milestones.length) * 100);
    if (timeUsedPercent - donePercent > SLA_MILESTONE_LAG_PERCENT) reasons.push(`${timeUsedPercent}% of the time used, ${donePercent}% of milestones done.`);
  }
  if (reasons.length > 0) return view("AT_RISK", reasons);
  if (!allocation.kickoffAt) return view("NOT_STARTED", [`Kick off by ${kickoffDue.toISOString()}.`]);
  return view("ON_TRACK");
}

/** Milestones for an allocation: the stored ones, or (older records) one per deliverable, or a single "Final delivery". */
export function milestonesFrom(deliverables: string[] | undefined, existing?: Milestone[]): Milestone[] {
  if (existing && existing.length > 0) return existing;
  const titles = (deliverables ?? []).map((d) => d.trim()).filter(Boolean);
  return (titles.length > 0 ? titles : ["Final delivery"]).map((title, i) => ({ id: `ms-${i + 1}`, title }));
}

/** D4: the longest extension allowed, in whole days (at least 1 when extensions are allowed at all). */
export function maxExtensionDays(allocation: Pick<Allocation, "allocatedAt" | "slaStartAt" | "slaDeadline"> & AllocationSlaFields, maxPercent: number): number {
  const start = new Date(allocation.slaStartAt || allocation.allocatedAt).getTime();
  const original = new Date(allocation.originalSlaDeadline || allocation.slaDeadline || start).getTime();
  const days = ((original - start) / DAY_MS) * (maxPercent / 100);
  return maxPercent <= 0 ? 0 : Math.max(1, Math.floor(days));
}

export type SlaEventType =
  | "ALLOCATED"
  | "KICKOFF"
  | "MILESTONE_DONE"
  | "SUBMITTED"
  | "ACCEPTED"
  | "REVISION_REQUESTED"
  | "EXTENSION_REQUESTED"
  | "EXTENSION_APPROVED"
  | "EXTENSION_REJECTED"
  | "PAUSED"
  | "RESUMED"
  | "HAND_BACK_REQUESTED"
  | "CANCELLED"
  | "REASSIGNED"
  | "REMINDER_48H"
  | "REMINDER_24H"
  | "REMINDER_AT_RISK"
  | "REMINDER_OVERDUE"
  | "REMINDER_KICKOFF";

/** G12: one entry on a project's timeline. Reminder events double as the "already sent" record. */
export interface SlaEvent {
  id: string;
  opportunityId: string;
  studentId: string;
  type: SlaEventType;
  at: string;
  by: string;
  note?: string;
}

/** G12: one row of the staff SLA board / "At-risk projects" card. */
export interface SlaBoardItem {
  opportunityId: string;
  title: string;
  company: string;
  studentId: string;
  studentName: string;
  sla: SlaView;
  pendingExtension: boolean;
  handBackRequested: boolean;
}
