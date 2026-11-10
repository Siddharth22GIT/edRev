import { can } from "@edurev/types";
import { runDailyChecks } from "../services/daily-checks.service.js";
import {
  cancelAllocationService,
  completeMilestoneService,
  decideExtensionService,
  getSubmissionFileService,
  kickoffService,
  listSlaEventsService,
  pauseService,
  requestExtensionService,
  requestHandBackService,
  resumeService,
  reviewSubmissionService,
  slaBoardService,
  slaViewOf,
  submitDeliveryService,
} from "../services/sla.service.js";
import { findAllocation } from "../services/workload.js";
import { getParam, handle, selfId } from "./phase4.helpers.js";

// Phase 4 (F2, F3, G9–G12): delivery, milestones, extensions and the SLA board. Doc: docs/modules/sla-and-delivery.md

const actorOf = (req: Parameters<Parameters<typeof handle>[0]>[0]) => ({ id: req.user!.id, name: req.user!.name || req.user!.role, role: req.user!.role });

/** Responds with the allocation plus its computed SLA. */
async function withSla(allocation: Awaited<ReturnType<typeof findAllocation>>) {
  return allocation ? { ...allocation, sla: await slaViewOf(allocation) } : null;
}

/* ---------------- the allocated student ---------------- */

export const kickoffHandler = handle(async (req, res) => {
  res.json({ data: await withSla(await kickoffService(getParam(req.params.id), selfId(req))), message: "Kicked off. Good luck!" });
}, "Failed to kick off.");

export const milestoneDoneHandler = handle(async (req, res) => {
  res.json({ data: await withSla(await completeMilestoneService(getParam(req.params.id), selfId(req), getParam(req.params.milestoneId))) });
}, "Failed to update the milestone.");

export const submitDeliveryHandler = handle(async (req, res) => {
  const { link, fileUrl, fileName, note } = req.body ?? {};
  const data = await submitDeliveryService(getParam(req.params.id), selfId(req), { link, fileUrl, fileName, note });
  res.status(201).json({ data: await withSla(data), message: "Submitted. Staff will accept it or ask for changes." });
}, "Failed to submit the delivery.");

export const requestExtensionHandler = handle(async (req, res) => {
  const data = await requestExtensionService(getParam(req.params.id), selfId(req), { days: req.body?.days, reason: req.body?.reason });
  res.status(201).json({ data: await withSla(data), message: "Extension requested. A Cell Coordinator will decide." });
}, "Failed to request an extension.");

export const handBackHandler = handle(async (req, res) => {
  const data = await requestHandBackService(getParam(req.params.id), selfId(req), req.body?.reason);
  res.json({ data: await withSla(data), message: "Your coordinator has been told. Keep the work as it is until it's reassigned." });
}, "Failed to request a hand-back.");

/** GET /opportunities/:id/submissions/:submissionId/file: the student who submitted it, or staff who review bids. */
export const submissionFileHandler = handle(async (req, res) => {
  const file = await getSubmissionFileService(getParam(req.params.id), getParam(req.params.submissionId));
  const user = req.user!;
  const own = user.role === "STUDENT" && file && file.studentId === (user.studentId || user.id);
  if (!file || (!own && !can(user.role, "BID_REVIEW"))) {
    res.status(404).json({ message: "File not found." });
    return;
  }
  const safeName = file.filename.replace(/[^\w.\- ]/g, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(file.buffer);
}, "Failed to load the file.");

/* ---------------- staff ---------------- */

export const reviewSubmissionHandler = handle(async (req, res) => {
  const { allocation, tierReview } = await reviewSubmissionService(getParam(req.params.id), getParam(req.params.submissionId), actorOf(req), { decision: req.body?.decision, feedback: req.body?.feedback });
  const message = req.body?.decision === "ACCEPT" ? (allocation.onTime ? "Accepted: delivered on time." : "Accepted: delivered late.") : "Revision requested. The student has been told.";
  res.json({ data: await withSla(allocation), tierReview, message });
}, "Failed to review the submission.");

export const decideExtensionHandler = handle(async (req, res) => {
  const data = await decideExtensionService(getParam(req.params.id), getParam(req.params.extensionId), actorOf(req), { approve: req.body?.approve, note: req.body?.note, clientAgreed: req.body?.clientAgreed });
  res.json({ data: await withSla(data), message: req.body?.approve ? "Extension approved." : "Extension refused." });
}, "Failed to decide the extension.");

export const pauseHandler = handle(async (req, res) => {
  res.json({ data: await withSla(await pauseService(getParam(req.params.id), actorOf(req), req.body?.reason)), message: "Paused." });
}, "Failed to pause.");

export const resumeHandler = handle(async (req, res) => {
  res.json({ data: await withSla(await resumeService(getParam(req.params.id), actorOf(req))), message: "Resumed. The deadline moved by the paused time." });
}, "Failed to resume.");

export const cancelHandler = handle(async (req, res) => {
  res.json({ data: await withSla(await cancelAllocationService(getParam(req.params.id), actorOf(req), req.body?.reason)), message: "Cancelled. The student isn't penalised." });
}, "Failed to cancel.");

/** GET /opportunities/:id/sla-events: the allocated student or staff who can see records. */
export const slaEventsHandler = handle(async (req, res) => {
  const opportunityId = getParam(req.params.id);
  const user = req.user!;
  if (user.role === "STUDENT") {
    const allocation = await findAllocation(opportunityId);
    if (!allocation || allocation.studentId !== (user.studentId || user.id)) {
      res.status(404).json({ message: "Timeline not found." });
      return;
    }
  } else if (!can(user.role, "STUDENT_RECORDS_VIEW")) {
    res.status(403).json({ message: `Forbidden: Role '${user.role}' is not authorized to perform this action.` });
    return;
  }
  res.json({ data: await listSlaEventsService(opportunityId) });
}, "Failed to load the timeline.");

export const slaBoardHandler = handle(async (_req, res) => {
  res.json({ data: await slaBoardService() });
}, "Failed to load the SLA board.");

/** POST /sla/run-checks { studentIds? }: an Administrator runs the daily checks now (optionally for some students). */
export const runChecksHandler = handle(async (req, res) => {
  const ids = req.body?.studentIds;
  if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some((x: unknown) => typeof x !== "string"))) {
    res.status(400).json({ message: "studentIds must be a list of up to 100 student ids." });
    return;
  }
  res.json({ data: await runDailyChecks({ onlyStudentIds: ids }) });
}, "Failed to run the checks.");
