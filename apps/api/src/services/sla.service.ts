import {
  addDaysYmd,
  can,
  computeSla,
  maxExtensionDays,
  milestonesFrom,
  type Allocation,
  type DeliverySubmission,
  type ExtensionRequest,
  type Milestone,
  type Opportunity,
  type SlaBoardItem,
  type SlaEvent,
  type SlaEventType,
  type SlaState,
  type SlaView,
  type User,
  type WeeklyCheckin,
} from "@edurev/types";
import { allocations as mockAllocations, getOpportunity as mockGetOpportunity, students as mockStudents } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AllocationModel, OpportunityModel, SlaEventModel, StudentModel, type SlaEventDocument } from "../models/index.js";
import { deadlineInstant, getInstitutionTimeZone } from "../utils/time.js";
import { isPdfBytes, parseBase64DataUrl } from "../utils/uploads.js";
import { isOnTime } from "./delivery.service.js";
import { overCapCheckinsService, weekContext } from "./hours.service.js";
import { getSafeguardLimitsService } from "./limits.service.js";
import { evaluateTierSuggestionService } from "./onboarding.service.js";
import { findAllocation, findOpportunity, httpError, isLive, isPaused, liveAllocations, newId, notifyStudent, opportunitiesByIds, strip, studentsByIds } from "./workload.js";

// Phase 4 (F2, F3, G9–G12): the life of allocated work. Allocated → kick-off → milestones → submitted →
// accepted / revision → completed on time or late, with extensions, pauses, cancellation and hand-back on the side.
// Every status change is a conditional update (only if the record is still in the expected state).
// Doc: docs/modules/sla-and-delivery.md

type Actor = Pick<User, "id" | "name" | "role">;

// Demo data mode keeps the timeline in memory (reset on restart, like all mock data)
const memEvents: SlaEventDocument[] = [];

const MAX_SUBMISSION_BYTES = 10 * 1024 * 1024;

/* ---------------- timeline (G12) ---------------- */

/** Adds a timeline entry. With `dedupeKey`, a second entry with the same key is refused (returns false). */
export async function logSlaEvent(event: Omit<SlaEvent, "id" | "at"> & { at?: string }, dedupeKey?: string): Promise<boolean> {
  const doc: SlaEventDocument = { id: newId("sla"), at: event.at ?? new Date().toISOString(), ...event, ...(dedupeKey ? { dedupeKey } : {}) };
  if (isDbConnected()) {
    try {
      await SlaEventModel.create(doc);
      return true;
    } catch (error: any) {
      if (error?.code === 11000 && dedupeKey) return false;
      throw error;
    }
  }
  if (dedupeKey && memEvents.some((e) => e.dedupeKey === dedupeKey)) return false;
  memEvents.push(doc);
  return true;
}

/** Best effort: a timeline write never breaks the action it describes. */
async function log(event: Omit<SlaEvent, "id" | "at">): Promise<void> {
  try {
    await logSlaEvent(event);
  } catch (error) {
    console.warn(`[sla] could not log ${event.type}: ${(error as Error).message}`);
  }
}

export async function listSlaEventsService(opportunityId: string): Promise<SlaEvent[]> {
  const list = isDbConnected() ? (await SlaEventModel.find({ opportunityId }).sort({ at: 1 }).lean()).map((e) => strip<SlaEventDocument>(e)) : memEvents.filter((e) => e.opportunityId === opportunityId);
  return list.sort((a, b) => a.at.localeCompare(b.at)).map(({ dedupeKey, ...rest }) => rest);
}

/* ---------------- reading ---------------- */

export async function slaViewOf(allocation: Allocation, now = new Date()): Promise<SlaView> {
  const limits = await getSafeguardLimitsService();
  return computeSla(allocation, now, limits.kickoffHours);
}

/** Submissions without their file contents (files download separately). */
function withoutFiles(allocation: Allocation): Allocation {
  if (!allocation.submissions?.length) return allocation;
  return { ...allocation, submissions: allocation.submissions.map(({ fileUrl, ...rest }) => ({ ...rest, ...(fileUrl ? { fileName: rest.fileName || "delivery.pdf" } : {}) })) };
}

/**
 * The allocation as a viewer may see it, plus its computed SLA (G9). Students who aren't the allocated student
 * see only the basics (no submissions, feedback, extensions or hand-back reasons).
 */
export function presentAllocation(allocation: Allocation, viewer: Pick<User, "role" | "studentId" | "id">, sla: SlaView): Allocation & { sla: SlaView } {
  const own = viewer.role !== "STUDENT" || (viewer.studentId || viewer.id) === allocation.studentId;
  const base = withoutFiles(allocation);
  if (own) return { ...base, sla };
  const { submissions, extensions, handBack, cancelReason, pauses, ...rest } = base;
  return { ...rest, sla };
}

/* ---------------- helpers ---------------- */

const LIVE = { status: { $nin: ["COMPLETED", "CANCELLED"] } };

/** The student's own live allocation, or a clear error. */
async function ownLive(opportunityId: string, studentId: string): Promise<Allocation> {
  const allocation = await findAllocation(opportunityId);
  if (!allocation || allocation.studentId !== studentId) throw httpError("This project isn't allocated to you.", 404);
  if (allocation.status === "COMPLETED") throw httpError("This project was already delivered.", 409);
  if (allocation.status === "CANCELLED") throw httpError("This project was cancelled.", 409);
  return allocation;
}

async function liveAllocation(opportunityId: string): Promise<Allocation> {
  const allocation = await findAllocation(opportunityId);
  if (!allocation) throw httpError("This opportunity hasn't been allocated.", 404);
  if (allocation.status === "COMPLETED") throw httpError("This work was already delivered.", 409);
  if (allocation.status === "CANCELLED") throw httpError("This allocation was cancelled.", 409);
  return allocation;
}

const changed = () => httpError("The project changed in the meantime. Refresh and try again.", 409);

/** Applies a conditional update in MongoDB (null when the condition no longer matches). */
async function update(filter: Record<string, unknown>, change: Record<string, unknown>, options: Record<string, unknown> = {}): Promise<Allocation | null> {
  const doc = await AllocationModel.findOneAndUpdate(filter, change, { new: true, ...options }).lean();
  return doc ? strip<Allocation>(doc) : null;
}

const mockOf = (opportunityId: string) => mockAllocations.find((a) => a.opportunityId === opportunityId)!;
const text = (value: unknown, min: number, max: number, what: string): string => {
  const v = typeof value === "string" ? value.trim() : "";
  if (v.length < min || v.length > max) throw httpError(`${what} must be ${min} to ${max} characters.`, 400);
  return v;
};

/* ---------------- student actions ---------------- */

/** G10: the student confirms they've started (expected within `kickoffHours` of allocation). */
export async function kickoffService(opportunityId: string, studentId: string): Promise<Allocation> {
  const current = await ownLive(opportunityId, studentId);
  if (current.kickoffAt) throw httpError("You've already kicked off this project.", 409);
  const now = new Date().toISOString();
  let saved: Allocation;
  if (isDbConnected()) {
    const doc = await update({ opportunityId, studentId, ...LIVE, kickoffAt: { $exists: false } }, { $set: { kickoffAt: now, status: "ACTIVE" } });
    if (!doc) throw changed();
    saved = doc;
  } else saved = Object.assign(mockOf(opportunityId), { kickoffAt: now, status: "ACTIVE" as const });
  await log({ opportunityId, studentId, type: "KICKOFF", by: studentId });
  return saved;
}

/** Older allocations have no stored milestones: they get one per deliverable the first time one is marked. */
async function ensureMilestones(allocation: Allocation, opportunity: Opportunity | null): Promise<Milestone[]> {
  if (allocation.milestones?.length) return allocation.milestones;
  const created = milestonesFrom(opportunity?.deliverables);
  if (isDbConnected()) {
    await AllocationModel.updateOne({ opportunityId: allocation.opportunityId, $or: [{ milestones: { $exists: false } }, { milestones: { $size: 0 } }] }, { $set: { milestones: created } });
    return (await findAllocation(allocation.opportunityId))?.milestones ?? created;
  }
  mockOf(allocation.opportunityId).milestones = created;
  return created;
}

/** F2a: the student marks a milestone done (once). */
export async function completeMilestoneService(opportunityId: string, studentId: string, milestoneId: string): Promise<Allocation> {
  const current = await ownLive(opportunityId, studentId);
  const milestones = await ensureMilestones(current, await findOpportunity(opportunityId));
  const milestone = milestones.find((m) => m.id === milestoneId);
  if (!milestone) throw httpError("Milestone not found.", 404);
  if (milestone.doneAt) throw httpError("This milestone is already marked done.", 409);
  const now = new Date().toISOString();
  let saved: Allocation;
  if (isDbConnected()) {
    const doc = await update(
      { opportunityId, studentId, ...LIVE, milestones: { $elemMatch: { id: milestoneId, doneAt: { $exists: false } } } },
      { $set: { "milestones.$.doneAt": now, ...(current.kickoffAt ? {} : { kickoffAt: now, status: "ACTIVE" }) } }
    );
    if (!doc) throw httpError("This milestone is already marked done.", 409);
    saved = doc;
  } else {
    const record = mockOf(opportunityId);
    record.milestones!.find((m) => m.id === milestoneId)!.doneAt = now;
    if (!record.kickoffAt) Object.assign(record, { kickoffAt: now, status: "ACTIVE" });
    saved = record;
  }
  await log({ opportunityId, studentId, type: "MILESTONE_DONE", by: studentId, note: milestone.title });
  return saved;
}

export interface SubmissionInput {
  link?: string;
  fileUrl?: string;
  fileName?: string;
  note?: string;
}

/** F2b: validates a hand-in. Returns the cleaned fields or throws 400. Files are checked by their bytes. */
function cleanSubmission(input: SubmissionInput): Pick<DeliverySubmission, "link" | "fileUrl" | "fileName" | "note"> {
  const out: Pick<DeliverySubmission, "link" | "fileUrl" | "fileName" | "note"> = {};
  if (input.link !== undefined && input.link !== "") {
    const link = typeof input.link === "string" ? input.link.trim() : "";
    let ok = false;
    try {
      const url = new URL(link);
      ok = (url.protocol === "https:" || url.protocol === "http:") && link.length <= 500;
    } catch {
      ok = false;
    }
    if (!ok) throw httpError("The delivery link must be a web address starting with https:// (at most 500 characters).", 400);
    out.link = link;
  }
  if (input.fileUrl !== undefined && input.fileUrl !== "") {
    const parsed = parseBase64DataUrl(input.fileUrl);
    if (!parsed) throw httpError("The delivery file must be uploaded as a PDF.", 400);
    if (parsed.bytes.length > MAX_SUBMISSION_BYTES) throw httpError("The delivery PDF must be 10 MB or smaller.", 400);
    if (!isPdfBytes(parsed.bytes)) throw httpError("The delivery file is not a valid PDF.", 400);
    out.fileUrl = `data:application/pdf;base64,${parsed.bytes.toString("base64")}`;
    out.fileName = (typeof input.fileName === "string" && input.fileName.trim() ? input.fileName.trim() : "delivery.pdf").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 120);
  }
  if (!out.link && !out.fileUrl) throw httpError("Add a link to the work or attach a PDF.", 400);
  if (input.note !== undefined && input.note !== "") out.note = text(input.note, 1, 1000, "The note");
  return out;
}

/** F2b: the student hands in the work. One submission waits for review at a time. */
export async function submitDeliveryService(opportunityId: string, studentId: string, input: SubmissionInput): Promise<Allocation> {
  const fields = cleanSubmission(input);
  const current = await ownLive(opportunityId, studentId);
  const submissions = current.submissions ?? [];
  if (submissions.some((s) => !s.decision)) throw httpError("Your last submission is still waiting for review.", 409);
  const now = new Date().toISOString();
  const submission: DeliverySubmission = { id: newId("sub"), round: submissions.length + 1, ...fields, submittedAt: now };
  let saved: Allocation;
  if (isDbConnected()) {
    const doc = await update(
      { opportunityId, studentId, ...LIVE, submissions: { $not: { $elemMatch: { decision: { $exists: false } } } } },
      { $push: { submissions: submission }, ...(current.kickoffAt ? {} : { $set: { kickoffAt: now, status: "ACTIVE" } }) }
    );
    if (!doc) throw httpError("Your last submission is still waiting for review.", 409);
    saved = doc;
  } else {
    const record = mockOf(opportunityId);
    record.submissions = [...(record.submissions ?? []), submission];
    if (!record.kickoffAt) Object.assign(record, { kickoffAt: now, status: "ACTIVE" });
    saved = record;
  }
  await log({ opportunityId, studentId, type: "SUBMITTED", by: studentId, note: `Round ${submission.round}` });
  return withoutFiles(saved);
}

/** The file of one submission (student who made it, or staff). */
export async function getSubmissionFileService(opportunityId: string, submissionId: string): Promise<{ buffer: Buffer; filename: string; studentId: string } | null> {
  const allocation = await findAllocation(opportunityId);
  const submission = allocation?.submissions?.find((s) => s.id === submissionId);
  if (!allocation || !submission?.fileUrl) return null;
  const parsed = parseBase64DataUrl(submission.fileUrl);
  if (!parsed) return null;
  return { buffer: parsed.bytes, filename: submission.fileName || "delivery.pdf", studentId: allocation.studentId };
}

/** G10 / D4: the student asks for more days, before the deadline. One pending request at a time. */
export async function requestExtensionService(opportunityId: string, studentId: string, input: { days: unknown; reason: unknown }): Promise<Allocation> {
  const current = await ownLive(opportunityId, studentId);
  const limits = await getSafeguardLimitsService();
  const reason = text(input.reason, 5, 300, "The reason");
  const extensions = current.extensions ?? [];
  if (extensions.some((e) => e.status === "PENDING")) throw httpError("You already have an extension request waiting for a decision.", 409);
  if (extensions.filter((e) => e.status === "APPROVED").length >= limits.extensionMaxPerProject) {
    throw httpError(`This project already had ${limits.extensionMaxPerProject === 1 ? "its extension" : `${limits.extensionMaxPerProject} extensions`}. Talk to your Cell Coordinator.`, 409);
  }
  if (!current.slaDeadline || Date.now() >= new Date(current.slaDeadline).getTime()) throw httpError("Extensions must be asked for before the deadline.", 409);
  const max = maxExtensionDays(current, limits.extensionMaxPercent);
  if (!Number.isInteger(input.days) || (input.days as number) < 1 || (input.days as number) > max) throw httpError(`days must be a whole number from 1 to ${max} (${limits.extensionMaxPercent}% of the project's time).`, 400);

  const request: ExtensionRequest = { id: newId("ext"), days: input.days as number, reason, requestedAt: new Date().toISOString(), status: "PENDING" };
  let saved: Allocation;
  if (isDbConnected()) {
    const doc = await update({ opportunityId, studentId, ...LIVE, extensions: { $not: { $elemMatch: { status: "PENDING" } } } }, { $push: { extensions: request } });
    if (!doc) throw httpError("You already have an extension request waiting for a decision.", 409);
    saved = doc;
  } else {
    const record = mockOf(opportunityId);
    record.extensions = [...extensions, request];
    saved = record;
  }
  await log({ opportunityId, studentId, type: "EXTENSION_REQUESTED", by: studentId, note: `${request.days} day(s): ${reason}` });
  return withoutFiles(saved);
}

/** The student asks to hand the work back (illness, overload). A coordinator then reassigns it; it isn't counted as late. */
export async function requestHandBackService(opportunityId: string, studentId: string, reasonInput: unknown): Promise<Allocation> {
  const current = await ownLive(opportunityId, studentId);
  if (current.handBack) throw httpError("You've already asked to hand this project back.", 409);
  const reason = text(reasonInput, 5, 300, "The reason");
  const handBack = { requestedAt: new Date().toISOString(), reason };
  let saved: Allocation;
  if (isDbConnected()) {
    const doc = await update({ opportunityId, studentId, ...LIVE, handBack: { $exists: false } }, { $set: { handBack } });
    if (!doc) throw httpError("You've already asked to hand this project back.", 409);
    saved = doc;
  } else saved = Object.assign(mockOf(opportunityId), { handBack });
  await log({ opportunityId, studentId, type: "HAND_BACK_REQUESTED", by: studentId, note: reason });
  return withoutFiles(saved);
}

/* ---------------- staff actions ---------------- */

/** Marks work delivered: atomic on "still live", counts the project and reviews the tier. Shared by accept and confirm. */
export async function completeAllocation(opportunityId: string, confirmedBy: string, deliveredAt: Date, extraSet: Record<string, unknown> = {}, extraFilter: Record<string, unknown> = {}, arrayFilters?: Record<string, unknown>[]): Promise<Allocation> {
  const current = await findAllocation(opportunityId);
  if (!current) throw httpError("This opportunity has not been allocated yet.", 404);
  if (current.status === "COMPLETED") throw httpError("Delivery was already confirmed for this work.", 409);
  if (current.status === "CANCELLED") throw httpError("This allocation was cancelled.", 409);
  if (deliveredAt.getTime() < new Date(current.allocatedAt).getTime()) throw httpError("Delivery date cannot be before the work was allocated.", 400);
  const opportunity = await findOpportunity(opportunityId);
  const onTime = isOnTime(deliveredAt, opportunity?.deadline, current.slaDeadline, await getInstitutionTimeZone());
  const set = { status: "COMPLETED", slaStatus: "COMPLETED", deliveredAt: deliveredAt.toISOString(), deliveryConfirmedBy: confirmedBy, onTime, ...extraSet };

  let saved: Allocation;
  if (isDbConnected()) {
    const doc = await update({ opportunityId, ...LIVE, ...extraFilter }, { $set: set }, arrayFilters ? { arrayFilters } : {});
    if (!doc) throw httpError("Delivery was already confirmed for this work.", 409);
    saved = doc;
    await StudentModel.updateOne({ id: saved.studentId }, { $inc: { projectsCompleted: 1 } });
  } else {
    const record = mockOf(opportunityId);
    Object.assign(record, { status: "COMPLETED", slaStatus: "COMPLETED", deliveredAt: deliveredAt.toISOString(), deliveryConfirmedBy: confirmedBy, onTime });
    saved = record;
    const student = mockStudents.find((s) => s.id === saved.studentId);
    if (student) student.projectsCompleted += 1;
  }
  return saved;
}

/**
 * F2b: staff accept the work (completes it, on time or late against the agreed deadline) or ask for a revision.
 * `revisionRounds` revisions are included; another one needs SLA_MANAGE (Cell Coordinator, Administrator).
 */
export async function reviewSubmissionService(opportunityId: string, submissionId: string, actor: Actor, input: { decision: unknown; feedback?: unknown }): Promise<{ allocation: Allocation; tierReview: { status: string; suggestedTier: string } | null }> {
  if (input.decision !== "ACCEPT" && input.decision !== "REVISION") throw httpError('decision must be "ACCEPT" or "REVISION".', 400);
  const current = await liveAllocation(opportunityId);
  const submission = current.submissions?.find((s) => s.id === submissionId);
  if (!submission) throw httpError("Submission not found.", 404);
  if (submission.decision) throw httpError(`This submission was already ${submission.decision === "ACCEPTED" ? "accepted" : "sent back for revision"}.`, 409);
  const now = new Date().toISOString();

  if (input.decision === "ACCEPT") {
    const feedback = input.feedback ? text(input.feedback, 1, 1000, "Feedback") : undefined;
    const decided = { "submissions.$[s].decision": "ACCEPTED", "submissions.$[s].decidedBy": actor.name, "submissions.$[s].decidedAt": now, ...(feedback ? { "submissions.$[s].feedback": feedback } : {}) };
    let saved: Allocation;
    if (isDbConnected()) {
      saved = await completeAllocation(opportunityId, actor.name, new Date(submission.submittedAt), decided, { submissions: { $elemMatch: { id: submissionId, decision: { $exists: false } } } }, [{ "s.id": submissionId }]);
    } else {
      saved = await completeAllocation(opportunityId, actor.name, new Date(submission.submittedAt));
      Object.assign(saved.submissions!.find((s) => s.id === submissionId)!, { decision: "ACCEPTED", decidedBy: actor.name, decidedAt: now, ...(feedback ? { feedback } : {}) });
    }
    await log({ opportunityId, studentId: saved.studentId, type: "ACCEPTED", by: actor.name, note: saved.onTime ? "On time" : "Late" });
    await notifyStudent(saved.studentId, `Delivery accepted`, `Your delivery for this project was accepted by ${actor.name}${saved.onTime ? ", on time" : " (after the agreed deadline)"}. Well done!${feedback ? `\n\nFeedback: ${feedback}` : ""}`);
    let tierReview = null;
    try {
      const s = await evaluateTierSuggestionService(saved.studentId);
      tierReview = s ? { status: s.status, suggestedTier: s.suggestedTier } : null;
    } catch {
      tierReview = null;
    }
    return { allocation: withoutFiles(saved), tierReview };
  }

  const feedback = text(input.feedback, 5, 1000, "Feedback for a revision");
  const limits = await getSafeguardLimitsService();
  const used = (current.submissions ?? []).filter((s) => s.decision === "REVISION_REQUESTED").length;
  if (used >= limits.revisionRounds && !can(actor.role, "SLA_MANAGE")) {
    throw httpError(`${limits.revisionRounds} revision rounds are included. Another one needs a Cell Coordinator or Administrator.`, 403);
  }
  let saved: Allocation;
  if (isDbConnected()) {
    const doc = await update(
      { opportunityId, ...LIVE, submissions: { $elemMatch: { id: submissionId, decision: { $exists: false } } } },
      { $set: { "submissions.$.decision": "REVISION_REQUESTED", "submissions.$.decidedBy": actor.name, "submissions.$.decidedAt": now, "submissions.$.feedback": feedback } }
    );
    if (!doc) throw httpError("This submission was already decided.", 409);
    saved = doc;
  } else {
    saved = mockOf(opportunityId);
    Object.assign(saved.submissions!.find((s) => s.id === submissionId)!, { decision: "REVISION_REQUESTED", decidedBy: actor.name, decidedAt: now, feedback });
  }
  await log({ opportunityId, studentId: saved.studentId, type: "REVISION_REQUESTED", by: actor.name, note: feedback });
  await notifyStudent(saved.studentId, "Revision requested", `${actor.name} asked for changes to your delivery (round ${submission.round}):\n\n${feedback}\n\nSubmit the updated work on the project page.`, true);
  return { allocation: withoutFiles(saved), tierReview: null };
}

/**
 * G10: approve or refuse an extension. The agreed deadline can't move past the client's date unless the
 * coordinator confirms the client agreed (`clientAgreed`); otherwise they reassign or renegotiate.
 */
export async function decideExtensionService(opportunityId: string, extensionId: string, actor: Actor, input: { approve: unknown; note?: unknown; clientAgreed?: unknown }): Promise<Allocation> {
  if (typeof input.approve !== "boolean") throw httpError("approve must be true or false.", 400);
  const current = await liveAllocation(opportunityId);
  const request = current.extensions?.find((e) => e.id === extensionId);
  if (!request) throw httpError("Extension request not found.", 404);
  if (request.status !== "PENDING") throw httpError(`This request was already ${request.status.toLowerCase()}.`, 409);
  const note = input.note ? text(input.note, 1, 300, "The note") : undefined;
  const now = new Date().toISOString();

  let newDeadline: string | undefined;
  if (input.approve) {
    const base = new Date(current.slaDeadline || now).getTime();
    newDeadline = new Date(base + request.days * 86_400_000).toISOString();
    const opportunity = await findOpportunity(opportunityId);
    const clientDue = deadlineInstant(opportunity?.deadline, await getInstitutionTimeZone());
    if (clientDue && new Date(newDeadline).getTime() > clientDue.getTime() && input.clientAgreed !== true) {
      throw httpError(`The new deadline would be after the client's date (${clientDue.toISOString().slice(0, 10)}). Confirm the client agreed (clientAgreed: true), or reassign the work.`, 409);
    }
  }

  const status = input.approve ? "APPROVED" : "REJECTED";
  const fields = { "extensions.$.status": status, "extensions.$.decidedBy": actor.name, "extensions.$.decidedAt": now, ...(note ? { "extensions.$.note": note } : {}), ...(newDeadline ? { "extensions.$.newDeadline": newDeadline } : {}) };
  const deadlineFields = newDeadline ? { slaDeadline: newDeadline, ...(current.originalSlaDeadline ? {} : { originalSlaDeadline: current.slaDeadline }) } : {};
  let saved: Allocation;
  if (isDbConnected()) {
    const doc = await update({ opportunityId, ...LIVE, extensions: { $elemMatch: { id: extensionId, status: "PENDING" } } }, { $set: { ...fields, ...deadlineFields } });
    if (!doc) throw httpError("This request was already decided.", 409);
    saved = doc;
  } else {
    saved = mockOf(opportunityId);
    Object.assign(saved.extensions!.find((e) => e.id === extensionId)!, { status, decidedBy: actor.name, decidedAt: now, ...(note ? { note } : {}), ...(newDeadline ? { newDeadline } : {}) });
    Object.assign(saved, deadlineFields);
  }
  await log({ opportunityId, studentId: saved.studentId, type: input.approve ? "EXTENSION_APPROVED" : "EXTENSION_REJECTED", by: actor.name, note: newDeadline ? `New deadline ${newDeadline}` : note });
  await notifyStudent(
    saved.studentId,
    input.approve ? "Extension approved" : "Extension not approved",
    input.approve ? `${actor.name} approved ${request.days} more day(s). Your new deadline is ${newDeadline}.${note ? `\n\n${note}` : ""}` : `${actor.name} didn't approve the extension.${note ? `\n\n${note}` : ""} Keep to the current deadline, or reply to your coordinator.`
  );
  return withoutFiles(saved);
}

/** G10: pause allocated work (exams, approved leave). While paused it is never overdue and isn't counted in weekly hours. */
export async function pauseService(opportunityId: string, actor: Actor, reasonInput: unknown): Promise<Allocation> {
  const reason = text(reasonInput, 5, 300, "The reason");
  const current = await liveAllocation(opportunityId);
  if (isPaused(current)) throw httpError("This project is already paused.", 409);
  const pause = { from: new Date().toISOString(), reason, by: actor.name };
  let saved: Allocation;
  if (isDbConnected()) {
    const doc = await update({ opportunityId, ...LIVE, pauses: { $not: { $elemMatch: { to: { $exists: false } } } } }, { $push: { pauses: pause } });
    if (!doc) throw httpError("This project is already paused.", 409);
    saved = doc;
  } else {
    saved = mockOf(opportunityId);
    saved.pauses = [...(saved.pauses ?? []), pause];
  }
  await log({ opportunityId, studentId: saved.studentId, type: "PAUSED", by: actor.name, note: reason });
  await notifyStudent(saved.studentId, "Project paused", `${actor.name} paused your project: ${reason}. The deadline moves by the paused time when it resumes.`);
  return withoutFiles(saved);
}

/** Resumes paused work; the agreed deadline moves later by the paused time. */
export async function resumeService(opportunityId: string, actor: Actor): Promise<Allocation> {
  const current = await liveAllocation(opportunityId);
  const open = (current.pauses ?? []).find((p) => !p.to);
  if (!open) throw httpError("This project isn't paused.", 409);
  const now = new Date();
  const pausedMs = now.getTime() - new Date(open.from).getTime();
  const slaDeadline = current.slaDeadline ? new Date(new Date(current.slaDeadline).getTime() + pausedMs).toISOString() : undefined;
  const deadlineFields = slaDeadline ? { slaDeadline, ...(current.originalSlaDeadline ? {} : { originalSlaDeadline: current.slaDeadline }) } : {};
  let saved: Allocation;
  if (isDbConnected()) {
    const doc = await update(
      { opportunityId, ...LIVE, pauses: { $elemMatch: { from: open.from, to: { $exists: false } } } },
      { $set: { "pauses.$[p].to": now.toISOString(), ...deadlineFields } },
      { arrayFilters: [{ "p.from": open.from, "p.to": { $exists: false } }] }
    );
    if (!doc) throw httpError("This project isn't paused.", 409);
    saved = doc;
  } else {
    saved = mockOf(opportunityId);
    saved.pauses!.find((p) => !p.to)!.to = now.toISOString();
    Object.assign(saved, deadlineFields);
  }
  await log({ opportunityId, studentId: saved.studentId, type: "RESUMED", by: actor.name, note: slaDeadline ? `New deadline ${slaDeadline}` : undefined });
  await notifyStudent(saved.studentId, "Project resumed", `${actor.name} resumed your project.${slaDeadline ? ` Your deadline is now ${slaDeadline}.` : ""}`);
  return withoutFiles(saved);
}

/** The client cancelled: the allocation ends with no penalty for the student, and the opportunity closes. */
export async function cancelAllocationService(opportunityId: string, actor: Actor, reasonInput: unknown): Promise<Allocation> {
  const reason = text(reasonInput, 5, 300, "The reason");
  await liveAllocation(opportunityId);
  const now = new Date().toISOString();
  const set = { status: "CANCELLED" as const, slaStatus: "CANCELLED" as const, cancelledAt: now, cancelledBy: actor.name, cancelReason: reason };
  let saved: Allocation;
  if (isDbConnected()) {
    const doc = await update({ opportunityId, ...LIVE }, { $set: set });
    if (!doc) throw changed();
    saved = doc;
    await OpportunityModel.updateOne({ id: opportunityId }, { $set: { status: "CLOSED", updatedAt: now } });
  } else {
    saved = Object.assign(mockOf(opportunityId), set);
    const opp = mockGetOpportunity(opportunityId);
    if (opp) opp.status = "CLOSED";
  }
  await log({ opportunityId, studentId: saved.studentId, type: "CANCELLED", by: actor.name, note: reason });
  await notifyStudent(saved.studentId, "Project cancelled", `This project was cancelled: ${reason}. It doesn't count against your delivery record.`);
  return withoutFiles(saved);
}

/* ---------------- board (G12) ---------------- */

const BOARD_ORDER: SlaState[] = ["OVERDUE", "AT_RISK", "SUBMITTED", "PAUSED", "NOT_STARTED", "ON_TRACK"];

export interface SlaBoard {
  items: SlaBoardItem[];
  /** Check-ins over the weekly cap (last week and this week): mentors check in with these students. */
  overCap: Pick<WeeklyCheckin, "studentId" | "weekStart" | "totalHours" | "cap" | "source">[];
}

/** G12: every live project with its SLA, most urgent first; plus students who went over their weekly hours. */
export async function slaBoardService(now = new Date()): Promise<SlaBoard> {
  const live = await liveAllocations();
  const [opps, students, limits] = await Promise.all([opportunitiesByIds(live.map((a) => a.opportunityId)), studentsByIds(live.map((a) => a.studentId)), getSafeguardLimitsService()]);
  const items: SlaBoardItem[] = live.map((a) => {
    const opp = opps.get(a.opportunityId);
    return {
      opportunityId: a.opportunityId,
      title: opp?.title ?? a.opportunityId,
      company: opp?.company ?? "",
      studentId: a.studentId,
      studentName: students.get(a.studentId)?.name ?? a.studentId,
      sla: computeSla(a, now, limits.kickoffHours),
      pendingExtension: (a.extensions ?? []).some((e) => e.status === "PENDING"),
      handBackRequested: Boolean(a.handBack),
    };
  });
  items.sort((x, y) => BOARD_ORDER.indexOf(x.sla.state) - BOARD_ORDER.indexOf(y.sla.state) || (x.sla.dueAt ?? "").localeCompare(y.sla.dueAt ?? ""));

  const ctx = await weekContext(now);
  const overCap = [...(await overCapCheckinsService(addDaysYmd(ctx.weekStart, -7))), ...(await overCapCheckinsService(ctx.weekStart))].map(({ studentId, weekStart, totalHours, cap, source }) => ({ studentId, weekStart, totalHours, cap, source }));
  return { items, overCap };
}

/* ---------------- reminders (G12) ---------------- */

/**
 * G12: sends each due reminder once per deadline: 48 h and 24 h before, at risk, overdue and a missed kick-off.
 * The "already sent" record is written first with a unique key, so a reminder is never sent twice, even when two
 * runs overlap or the API restarts mid-run (at worst one reminder is skipped, never doubled).
 */
export async function sendSlaRemindersService(now = new Date(), onlyStudentIds?: string[]): Promise<{ sent: number }> {
  const limits = await getSafeguardLimitsService();
  const live = (await liveAllocations()).filter((a) => !onlyStudentIds || onlyStudentIds.includes(a.studentId));
  const opps = await opportunitiesByIds(live.map((a) => a.opportunityId));
  let sent = 0;
  for (const a of live) {
    const sla = computeSla(a, now, limits.kickoffHours);
    const title = opps.get(a.opportunityId)?.title ?? "your project";
    const due: { type: SlaEventType; subject: string; body: string; important?: boolean }[] = [];
    if (sla.state === "PAUSED") continue;
    if (sla.kickoffDueAt && now.getTime() > new Date(sla.kickoffDueAt).getTime() && !a.kickoffAt) {
      due.push({ type: "REMINDER_KICKOFF", subject: `Kick off "${title}"`, body: `You haven't kicked off "${title}" yet. Open the project, press Kick off and plan your milestones.` });
    }
    if (sla.state === "OVERDUE") {
      due.push({ type: "REMINDER_OVERDUE", subject: `Overdue: "${title}"`, body: `"${title}" is past its agreed deadline. Submit what you have, or reply to your coordinator about the next step.`, important: true });
    } else if (sla.state !== "SUBMITTED" && sla.hoursLeft !== null) {
      if (sla.hoursLeft <= 24) due.push({ type: "REMINDER_24H", subject: `Due within 24 hours: "${title}"`, body: `"${title}" is due within 24 hours. Submit it on the project page.`, important: true });
      else if (sla.hoursLeft <= 48) due.push({ type: "REMINDER_48H", subject: `Due in 2 days: "${title}"`, body: `"${title}" is due in about 2 days. If you need more time, ask for an extension before the deadline.` });
      if (sla.state === "AT_RISK") due.push({ type: "REMINDER_AT_RISK", subject: `At risk: "${title}"`, body: `"${title}" looks at risk: ${sla.reasons.join(" ")} Update your milestones, or ask for help early.` });
    }
    for (const r of due) {
      const key = `${r.type}:${a.opportunityId}:${a.studentId}:${a.slaDeadline ?? ""}`;
      if (!(await logSlaEvent({ opportunityId: a.opportunityId, studentId: a.studentId, type: r.type, by: "SYSTEM" }, key))) continue;
      if (await notifyStudent(a.studentId, r.subject, r.body, r.important)) sent++;
    }
  }
  return { sent };
}

/** Test/cleanup helper. */
export async function deleteSlaEventsFor(opportunityIds: string[]): Promise<void> {
  if (isDbConnected()) {
    await SlaEventModel.deleteMany({ opportunityId: { $in: opportunityIds } });
    return;
  }
  for (let i = memEvents.length - 1; i >= 0; i--) if (opportunityIds.includes(memEvents[i].opportunityId)) memEvents.splice(i, 1);
}
