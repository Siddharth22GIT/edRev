import { getCheckinService, listEntriesService, runningTimerService, saveCheckinService, startTimerService, stopTimerService, weekContext, weeklyHoursSummaryService } from "../services/hours.service.js";
import { getParam, handle, selfId } from "./phase4.helpers.js";

// D10 / G2: weekly hours, the Start/Stop timer and the Monday check-in. Doc: docs/modules/safeguards.md §5

/** GET /hours/:studentId/week: the week's summary, recorded entries and the running timer. */
export const getWeekHandler = handle(async (req, res) => {
  const studentId = getParam(req.params.studentId);
  const ctx = await weekContext();
  const week = typeof req.query.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.week) ? req.query.week : ctx.weekStart;
  const [summary, entries, runningTimer] = await Promise.all([weeklyHoursSummaryService(studentId), listEntriesService(studentId, week), runningTimerService(studentId)]);
  res.json({ data: { summary, weekStart: week, entries, runningTimer } });
}, "Failed to load the week's hours.");

/** POST /hours/timer/start { opportunityId }: the student's own live project only. */
export const startTimerHandler = handle(async (req, res) => {
  const opportunityId = req.body?.opportunityId;
  if (typeof opportunityId !== "string" || !opportunityId) {
    res.status(400).json({ message: "opportunityId is required." });
    return;
  }
  const data = await startTimerService(selfId(req), opportunityId, req.user!.name);
  res.status(201).json({ data });
}, "Failed to start the timer.");

/** POST /hours/timer/stop */
export const stopTimerHandler = handle(async (req, res) => {
  const data = await stopTimerService(selfId(req));
  res.json({ data, ...(data.capped ? { note: "The timer ran for more than 8 hours, so it was cut to 8 hours. Correct it in your weekly check-in if needed." } : {}) });
}, "Failed to stop the timer.");

/** GET /checkins/:studentId?week=YYYY-MM-DD (default: last week). */
export const getCheckinHandler = handle(async (req, res) => {
  const week = typeof req.query.week === "string" ? req.query.week : undefined;
  res.json({ data: await getCheckinService(getParam(req.params.studentId), week) });
}, "Failed to load the check-in.");

/** PUT /checkins/:studentId/:weekStart { projects: [{ opportunityId, actualHours }], otherPaidHours, note } */
export const saveCheckinHandler = handle(async (req, res) => {
  const body = req.body ?? {};
  const data = await saveCheckinService(getParam(req.params.studentId), getParam(req.params.weekStart), { projects: body.projects, otherPaidHours: body.otherPaidHours, note: body.note }, req.user!.name);
  res.json({
    data,
    message: data.overCap ? `Saved. ${data.totalHours} h is over the ${data.cap} h cap, so your mentor will see it. Nothing is blocked.` : "Check-in saved.",
  });
}, "Failed to save the check-in.");
