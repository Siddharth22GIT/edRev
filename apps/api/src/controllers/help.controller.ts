import { createHelpRequestService, helpRequestsForViewer, resolveHelpRequestService } from "../services/help.service.js";
import { getParam, handle } from "./phase4.helpers.js";

// Phase 4 (G6): "Request help". Doc: docs/modules/safeguards.md §6

/** POST /help-requests { rule, opportunityId?, message? }: students only (identity from the token). */
export const createHelpRequestHandler = handle(async (req, res) => {
  const data = await createHelpRequestService(req.user!, { rule: req.body?.rule, opportunityId: req.body?.opportunityId, message: req.body?.message });
  res.status(201).json({ data, message: `Sent to ${data.routedUserName}. Replies arrive in Messages.` });
}, "Failed to send the help request.");

/** GET /help-requests?status=OPEN: a student's own, or the ones routed to a staff member's role. */
export const listHelpRequestsHandler = handle(async (req, res) => {
  const status = req.query.status === "OPEN" || req.query.status === "RESOLVED" ? req.query.status : undefined;
  res.json({ data: await helpRequestsForViewer(req.user!, status) });
}, "Failed to load help requests.");

/** POST /help-requests/:id/resolve { outcome } */
export const resolveHelpRequestHandler = handle(async (req, res) => {
  res.json({ data: await resolveHelpRequestService(getParam(req.params.id), req.user!, req.body?.outcome), message: "Resolved. The student can see the outcome in Messages." });
}, "Failed to resolve the help request.");
