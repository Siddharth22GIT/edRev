import { can, SAFEGUARD_RULES, workingDaysBetween, type HelpRequest, type MessageParty, type Role, type SafeguardRuleId, type User } from "@edurev/types";
import { isDbConnected } from "../config/db.js";
import { HelpRequestModel, UserModel } from "../models/index.js";
import { seedUsersList } from "../utils/seed.js";
import { getSafeguardLimitsService } from "./limits.service.js";
import { appendSystemNoteService, handOverThreadService, startHelpThreadService } from "./messages.service.js";
import { checkSafeguardsService } from "./safeguard.service.js";
import { findStudent, httpError, newId, strip, SYSTEM_ACTOR } from "./workload.js";

// Phase 4 (G6): "Request help". A blocked student asks about one rule; the request opens a private Messages thread
// with the staff member who can unlock it (the student's mentor for hours, a Faculty Director for academics…).
// Unanswered requests climb: Cell Coordinator, then Administrator. Doc: docs/modules/safeguards.md §6

type Actor = Omit<User, "passwordHash">;

// Demo data mode keeps requests in memory (reset on restart, like all mock data)
const mem: HelpRequest[] = [];

/** Where an unanswered request goes next: level 1 = Cell Coordinator, level 2 = Administrator. */
const ESCALATION: Role[] = ["CELL_COORDINATOR", "ADMINISTRATOR"];

/** Active staff accounts with a role (MongoDB users, or the development accounts in demo data mode). */
async function staffWithRole(role: Role): Promise<MessageParty[]> {
  if (isDbConnected()) {
    const users = await UserModel.find({ role, $or: [{ status: { $exists: false } }, { status: "ACTIVE" }] }, { id: 1, name: 1, role: 1 }).sort({ createdAt: 1 }).lean<{ id: string; name: string; role: Role }[]>();
    return users.map((u) => ({ userId: u.id, name: u.name, role: u.role }));
  }
  return seedUsersList.filter((u) => u.role === role).map((u) => ({ userId: u.id, name: u.name, role: u.role }));
}

/** The assigned person when there is one (the mentor named on the student record), else the first account with the role. */
async function routeTo(role: Role, mentorName?: string): Promise<MessageParty> {
  const candidates = await staffWithRole(role);
  const mentor = role === "GUILD_LEAD" && mentorName ? candidates.find((c) => c.name.trim().toLowerCase() === mentorName.trim().toLowerCase()) : undefined;
  if (mentor) return mentor;
  if (candidates.length > 0) return candidates[0];
  // HELP-04: nobody holds the role (e.g. no mentor accounts yet) → the shared coordinator queue, then the administrator
  for (const fallback of ESCALATION) {
    const list = await staffWithRole(fallback);
    if (list.length > 0) return list[0];
  }
  throw httpError("No staff account can take this request yet. Please tell your Cell Coordinator in person.", 503);
}

/**
 * G6: a student asks for help with a rule that is blocking (or warning) them right now. The block reason is
 * attached. One open request per rule (unique index): asking again while one is open returns 409.
 */
export async function createHelpRequestService(user: Actor, input: { rule: unknown; opportunityId?: unknown; message?: unknown }): Promise<HelpRequest> {
  const studentId = user.studentId || user.id;
  const rule = input.rule as SafeguardRuleId;
  if (typeof rule !== "string" || !SAFEGUARD_RULES[rule]) throw httpError(`rule must be one of ${Object.keys(SAFEGUARD_RULES).join(", ")}.`, 400);
  const opportunityId = typeof input.opportunityId === "string" && input.opportunityId ? input.opportunityId : undefined;
  const message = typeof input.message === "string" ? input.message.trim().slice(0, 1000) : "";

  const student = await findStudent(studentId);
  if (!student) throw httpError("Your student record wasn't found.", 404);
  const check = await checkSafeguardsService(studentId, opportunityId);
  const failing = (check.rules ?? []).find((r) => r.rule === rule && r.outcome !== "PASS");
  if (!failing) throw httpError(`"${SAFEGUARD_RULES[rule].label}" isn't blocking you right now, so there's nothing to ask about.`, 400);

  const open = await listHelpRequestsService({ studentId, status: "OPEN" });
  if (open.some((r) => r.rule === rule)) throw httpError("You already asked about this. Your request is open; replies arrive in Messages.", 409);

  const role = SAFEGUARD_RULES[rule].helpFrom;
  const staff = await routeTo(role, student.mentor);
  const body = [
    `Help request: ${SAFEGUARD_RULES[rule].label}`,
    `Reason shown to me: ${failing.message}`,
    failing.unlock ? `What unlocks it: ${failing.unlock}` : "",
    message ? `\nMy message: ${message}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const request: HelpRequest = {
    id: newId("help"),
    studentId,
    studentName: student.name,
    rule,
    reason: failing.message,
    ...(opportunityId ? { opportunityId } : {}),
    conversationId: "",
    routedRole: staff.role,
    routedUserId: staff.userId,
    routedUserName: staff.name,
    escalationLevel: 0,
    status: "OPEN",
    createdAt: new Date().toISOString(),
  };

  // The index is the final guard (two clicks at once): reserve the request first, then open the thread
  if (isDbConnected()) {
    try {
      await HelpRequestModel.create({ ...request, conversationId: "pending" });
    } catch (error: any) {
      if (error?.code === 11000) throw httpError("You already asked about this. Your request is open; replies arrive in Messages.", 409);
      throw error;
    }
  } else mem.push({ ...request, conversationId: "pending" });

  let conversation;
  try {
    conversation = await startHelpThreadService(user, staff, `Help: ${SAFEGUARD_RULES[rule].label}`, body);
  } catch (error) {
    // Don't leave a reservation behind that would block asking again
    if (isDbConnected()) await HelpRequestModel.deleteOne({ id: request.id });
    else mem.splice(mem.findIndex((r) => r.id === request.id), 1);
    throw error;
  }
  request.conversationId = conversation.id;
  if (isDbConnected()) await HelpRequestModel.updateOne({ id: request.id }, { $set: { conversationId: conversation.id } });
  else Object.assign(mem.find((r) => r.id === request.id)!, { conversationId: conversation.id });
  return request;
}

export async function listHelpRequestsService(filter: { studentId?: string; status?: HelpRequest["status"]; routedRole?: Role } = {}): Promise<HelpRequest[]> {
  const query: Record<string, unknown> = {};
  if (filter.studentId) query.studentId = filter.studentId;
  if (filter.status) query.status = filter.status;
  if (filter.routedRole) query.routedRole = filter.routedRole;
  if (isDbConnected()) return (await HelpRequestModel.find(query).sort({ createdAt: -1 }).lean()).map((r) => strip<HelpRequest>(r));
  return mem
    .filter((r) => (!filter.studentId || r.studentId === filter.studentId) && (!filter.status || r.status === filter.status) && (!filter.routedRole || r.routedRole === filter.routedRole))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** What a viewer may list: a student their own; staff the requests routed to their role (Administrators: all). */
export async function helpRequestsForViewer(user: Actor, status?: HelpRequest["status"]): Promise<HelpRequest[]> {
  if (user.role === "STUDENT") return listHelpRequestsService({ studentId: user.studentId || user.id, ...(status ? { status } : {}) });
  if (!can(user.role, "HELP_RESOLVE")) throw httpError(`Forbidden: Role '${user.role}' can't see help requests.`, 403);
  return listHelpRequestsService({ ...(status ? { status } : {}), ...(user.role === "ADMINISTRATOR" ? {} : { routedRole: user.role }) });
}

/** Closes a request with a one-line outcome (logged and posted in the thread). Only its role (or an Administrator). */
export async function resolveHelpRequestService(id: string, user: Actor, outcomeInput: unknown): Promise<HelpRequest> {
  const outcome = typeof outcomeInput === "string" ? outcomeInput.trim() : "";
  if (outcome.length < 5 || outcome.length > 300) throw httpError("Describe the outcome in 5 to 300 characters.", 400);
  const current = (await listHelpRequestsService()).find((r) => r.id === id);
  if (!current) throw httpError("Help request not found.", 404);
  if (user.role !== "ADMINISTRATOR" && current.routedRole !== user.role) throw httpError("This request is routed to another role.", 403);
  if (current.status === "RESOLVED") throw httpError("This request was already resolved.", 409);
  const changes = { status: "RESOLVED" as const, resolvedAt: new Date().toISOString(), resolvedBy: user.name, outcome };
  let saved: HelpRequest;
  if (isDbConnected()) {
    const doc = await HelpRequestModel.findOneAndUpdate({ id, status: "OPEN" }, { $set: changes }, { new: true }).lean();
    if (!doc) throw httpError("This request was already resolved.", 409);
    saved = strip<HelpRequest>(doc);
  } else saved = Object.assign(current, changes);
  await appendSystemNoteService(saved.conversationId, user, `Resolved: ${outcome}`);
  return saved;
}

/**
 * Daily check (G6): a request with no resolution after `helpEscalateWorkingDays` working days moves up one level
 * (Cell Coordinator, then Administrator). The thread is handed over with a note. Conditional on the level, so
 * two overlapping runs escalate once.
 */
export async function escalateHelpRequestsService(now = new Date(), onlyStudentIds?: string[]): Promise<{ escalated: number }> {
  const limits = await getSafeguardLimitsService();
  let escalated = 0;
  for (const r of await listHelpRequestsService({ status: "OPEN" })) {
    if (onlyStudentIds && !onlyStudentIds.includes(r.studentId)) continue;
    const since = new Date(r.escalatedAt || r.createdAt);
    if (r.escalationLevel >= ESCALATION.length || workingDaysBetween(since, now) < limits.helpEscalateWorkingDays) continue;
    let level = r.escalationLevel;
    let role: Role | undefined;
    while (level < ESCALATION.length) {
      role = ESCALATION[level++];
      if (role !== r.routedRole) break;
      role = undefined;
    }
    if (!role) continue;
    const staff = await routeTo(role);
    const changes = { escalationLevel: level, routedRole: staff.role, routedUserId: staff.userId, routedUserName: staff.name, escalatedAt: now.toISOString() };
    if (isDbConnected()) {
      const res = await HelpRequestModel.updateOne({ id: r.id, status: "OPEN", escalationLevel: r.escalationLevel }, { $set: changes });
      if (res.modifiedCount === 0) continue;
    } else Object.assign(mem.find((x) => x.id === r.id)!, changes);
    await handOverThreadService(r.conversationId, staff, `No reply from ${r.routedUserName} within ${limits.helpEscalateWorkingDays} working days, so this request moved to ${staff.name}.`, SYSTEM_ACTOR);
    escalated++;
  }
  return { escalated };
}

/** Test/cleanup helper. */
export async function deleteHelpRequestsForStudents(studentIds: string[]): Promise<void> {
  if (isDbConnected()) {
    await HelpRequestModel.deleteMany({ studentId: { $in: studentIds } });
    return;
  }
  for (let i = mem.length - 1; i >= 0; i--) if (studentIds.includes(mem[i].studentId)) mem.splice(i, 1);
}
