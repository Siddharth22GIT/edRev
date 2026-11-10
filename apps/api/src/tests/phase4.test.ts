import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import {
  computeSla,
  cooldownUntil,
  DEFAULT_SAFEGUARD_LIMITS,
  evaluateSafeguards,
  hoursPerWeek,
  safeguardLimitProblems,
  skillMatch,
  weekStartOf,
  workingDaysBetween,
  type AcademicSnapshot,
  type Allocation,
  type HourLog,
  type Opportunity,
  type SafeguardFacts,
  type Student,
  type Tier,
} from "@edurev/types";
import {
  academicSnapshots as mockAcademic,
  allocations as mockAllocations,
  bids as mockBids,
  hourLogs as mockHours,
  opportunities as mockOpportunities,
  students as mockStudents,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AcademicSnapshotModel, AllocationModel, BidModel, HourLogModel, OpportunityModel, StudentModel } from "../models/index.js";
import { escalateHelpRequestsService, deleteHelpRequestsForStudents } from "../services/help.service.js";
import { deleteHoursDataForStudents } from "../services/hours.service.js";
import { deleteConversationsForStudents } from "../services/messages.service.js";
import { deleteTierSuggestionsForStudent } from "../services/onboarding.service.js";
import { deleteOverridesForStudents } from "../services/safeguard.service.js";
import { deleteSlaEventsFor } from "../services/sla.service.js";
import { createToken, makeClient, startTestServer, stopTestServer, type TestUser } from "./helpers.js";

// Phase 4: safeguards engine, weekly hours, SLA lifecycle, reminders, help requests and skill match.
// Docs: docs/modules/safeguards.md, docs/modules/sla-and-delivery.md. Test names start with the item / edge-case ID.

const PREFIX = "P4T";
const DAY = 86_400_000;
const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const S = {
  hours: "stu-p4t-hours", // TIER_1: heavy project over the hour cap, then the full delivery lifecycle
  par: "stu-p4t-par", // TIER_1: one project, then the parallel limit; extensions and pause
  t3: "stu-p4t-t3", // TIER_3: two projects at once; client date, cancel, hand-back, reminders
  norec: "stu-p4t-norec", // no academic record yet: help request and escalation
  cool: "stu-p4t-cool", // two late deliveries: reliability cool-down
  exam: "stu-p4t-exam", // in a programme with an exam blackout
  att: "stu-p4t-att", // low attendance (soft, overridable)
};
const STUDENT_IDS = Object.values(S);

const student = (id: string, tier: Tier = "TIER_1", extra: Partial<Student> = {}): Student => ({
  id, name: `${PREFIX} ${id}`, email: `${id}@example.com`, avatarInitials: "PF", program: "Computer Science and Engineering", course: "B.Tech", year: 3,
  tier, status: "ACTIVE", skills: ["React", "Node.js"], trainingProgress: 50, progress: 50, cgpa: 8.5, joinedAt: "2026-01-10", projectsCompleted: 0, earnings: 0, mentor: "Elena Martin", ...extra,
});
const STUDENTS = [
  student(S.hours, "TIER_1", { mentor: "Vikram Malhotra" }),
  student(S.par),
  student(S.t3, "TIER_3"),
  student(S.norec),
  student(S.cool),
  student(S.exam, "TIER_1", { program: `${PREFIX} Exam Programme` }),
  student(S.att),
];
const academic = (studentId: string): AcademicSnapshot => ({ studentId, cgpa: 8.5, requiredCgpa: 7, cgpaStatus: "ELIGIBLE", complianceStatus: "COMPLIANT", attendancePercent: 90 });
const hourLog = (studentId: string): HourLog => ({ studentId, period: "2026-W46", allowedHours: 20, loggedHours: 0, remainingHours: 20, status: "NORMAL" });
const WITH_RECORDS = STUDENT_IDS.filter((id) => id !== S.norec);

const opp = (id: string, extra: Partial<Opportunity> = {}): Opportunity => ({
  id, title: `${PREFIX} ${id}`, project: `${PREFIX} ${id}`, description: "Phase 4 test", client: "Test Co", company: "Test Co", category: "Web development",
  skills: ["React"], budget: 1000, currency: "INR", deadline: "2099-12-31", status: "OPEN", requiredTier: "TIER_1", estimatedHours: 5,
  numberOfBids: 0, slaDeadline: "2099-12-31T00:00:00.000Z", matchScore: 0, deliverables: ["Research", "Build", "Handoff"], updatedAt: "2026-11-10", ...extra,
});
const O = {
  heavy: "opp-p4t-heavy", // 60 h over ~2 weeks = 30 h/week, above the 10 h term cap
  light: "opp-p4t-light", // tiny weekly load, client date in 20 days
  second: "opp-p4t-second", // a second project for S.par (parallel limit)
  clientDate: "opp-p4t-client", // agreed deadline = client date (extension past it needs the client's OK)
  soon: "opp-p4t-soon", // due in ~30 hours: reminders
  coolA: "opp-p4t-cool-a",
  coolB: "opp-p4t-cool-b",
  exam: "opp-p4t-exam",
};
const OPPS = [
  opp(O.heavy, { estimatedHours: 60, deadline: ymd(13) }),
  opp(O.light, { deadline: ymd(20) }),
  opp(O.second),
  opp(O.clientDate, { deadline: ymd(10), requiredTier: "TIER_3" }),
  opp(O.soon, { deadline: new Date(Date.now() + 30 * 3_600_000).toISOString(), requiredTier: "TIER_3" }),
  opp(O.coolA, { status: "ALLOCATED" }),
  opp(O.coolB, { status: "ALLOCATED" }),
  opp(O.exam),
];
const OPP_IDS = OPPS.map((o) => o.id);
const LATE: Allocation[] = [
  { opportunityId: O.coolA, studentId: S.cool, allocatedBy: "Test", allocatedAt: new Date(Date.now() - 40 * DAY).toISOString(), status: "COMPLETED", slaDeadline: new Date(Date.now() - 20 * DAY).toISOString(), deliveredAt: new Date(Date.now() - 18 * DAY).toISOString(), onTime: false },
  { opportunityId: O.coolB, studentId: S.cool, allocatedBy: "Test", allocatedAt: new Date(Date.now() - 30 * DAY).toISOString(), status: "COMPLETED", slaDeadline: new Date(Date.now() - 5 * DAY).toISOString(), deliveredAt: new Date(Date.now() - 4 * DAY).toISOString(), onTime: false },
];

const tokenUser = (studentId: string): TestUser => ({ id: `usr-${studentId}`, name: `${PREFIX} ${studentId}`, email: `${studentId}@revalanche.local`, role: "STUDENT", studentId });
const studentTokens = Object.fromEntries(STUDENT_IDS.map((id) => [id, createToken(tokenUser(id))]));

/* ------------------------------------------------------------------------------------------------ */
/* Pure rules (no server)                                                                           */
/* ------------------------------------------------------------------------------------------------ */

const baseFacts = (overrides: Partial<SafeguardFacts> = {}): SafeguardFacts => ({
  now: new Date("2026-11-10T06:00:00Z"),
  limits: DEFAULT_SAFEGUARD_LIMITS,
  tier: "TIER_1",
  academic: { recorded: true, cgpa: 8, requiredCgpa: 7, complianceStatus: "COMPLIANT", attendancePercent: 90 },
  blackoutNow: null,
  blackoutInProject: null,
  hours: { studentId: "s", weekStart: "2026-11-09", cap: 10, capKind: "TERM", plannedProjectHours: 0, otherPaidHours: 0, usedHours: 0, remainingHours: 10, projects: [] },
  legacyHoursBlocked: false,
  activeProjects: 0,
  cooldownUntil: null,
  overrides: [],
  ...overrides,
});

describe("Phase 4: pure rules", () => {
  it("D10: hours per week = estimated hours spread over the project's weeks", () => {
    const start = new Date("2026-11-10T00:00:00Z");
    assert.strictEqual(hoursPerWeek(24, start, new Date("2026-12-01T00:00:00Z")), 8, "24 h over 3 weeks");
    assert.strictEqual(hoursPerWeek(5, start, new Date("2026-11-12T00:00:00Z")), 5, "less than a week counts as one week");
    assert.strictEqual(hoursPerWeek(-3, start, null), 0, "nonsense estimates count as 0");
  });

  it("D10: Riya's example: 14 h planned + 12 h/week = 26 h > cap is blocked; + 5 h/week = 19 h fits a 20 h cap", () => {
    const hours = (candidate: number) => ({ ...baseFacts().hours, cap: 20, plannedProjectHours: 14, usedHours: 14, remainingHours: 6, candidateHours: candidate });
    const blocked = evaluateSafeguards(baseFacts({ tier: "TIER_4", hours: hours(12) })).find((r) => r.rule === "HOURS")!;
    assert.strictEqual(blocked.outcome, "BLOCK");
    assert.match(blocked.message, /26 h/);
    assert.strictEqual(evaluateSafeguards(baseFacts({ tier: "TIER_4", hours: hours(5) })).find((r) => r.rule === "HOURS")!.outcome, "PASS");
  });

  it("G5 / G6: hard blocks come first; an override lifts a soft block but never a hard one", () => {
    const facts = baseFacts({ requiredTier: "TIER_2", activeProjects: 1, cooldownUntil: "2026-11-20T00:00:00Z" });
    const order = evaluateSafeguards(facts).filter((r) => r.outcome === "BLOCK").map((r) => r.rule);
    assert.deepStrictEqual(order, ["TIER", "PARALLEL", "COOLDOWN"], "hard (tier, parallel) before soft (cool-down)");
    const override = (rule: "COOLDOWN" | "PARALLEL") => ({ id: "o", studentId: "s", rule, reason: "Approved", createdBy: "x", createdAt: "2026-11-01", expiresAt: "2026-12-01T00:00:00Z" });
    const lifted = evaluateSafeguards({ ...facts, overrides: [override("COOLDOWN"), override("PARALLEL")] });
    assert.strictEqual(lifted.find((r) => r.rule === "COOLDOWN")!.outcome, "PASS");
    assert.ok(lifted.find((r) => r.rule === "COOLDOWN")!.override);
    assert.strictEqual(lifted.find((r) => r.rule === "PARALLEL")!.outcome, "BLOCK", "hard rules ignore overrides");
    const expired = evaluateSafeguards({ ...facts, overrides: [{ ...override("COOLDOWN"), expiresAt: "2026-11-01T00:00:00Z" }] });
    assert.strictEqual(expired.find((r) => r.rule === "COOLDOWN")!.outcome, "BLOCK", "an expired override no longer counts");
  });

  it("G3: missing attendance is a warning (not a pass); low attendance blocks", () => {
    const missing = evaluateSafeguards(baseFacts({ academic: { recorded: true, cgpa: 8, requiredCgpa: 7, complianceStatus: "COMPLIANT" } }));
    assert.strictEqual(missing.find((r) => r.rule === "ATTENDANCE")!.outcome, "WARN");
    const low = evaluateSafeguards(baseFacts({ academic: { recorded: true, cgpa: 8, requiredCgpa: 7, complianceStatus: "COMPLIANT", attendancePercent: 60 } }));
    assert.strictEqual(low.find((r) => r.rule === "ATTENDANCE")!.outcome, "BLOCK");
    const notRecorded = evaluateSafeguards(baseFacts({ academic: null }));
    assert.strictEqual(notRecorded.find((r) => r.rule === "CGPA_RECORDED")!.outcome, "BLOCK");
  });

  it("D5: two overdue projects within 60 days start a 14-day cool-down from the second", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    assert.strictEqual(cooldownUntil(["2026-10-01T00:00:00Z", "2026-11-05T00:00:00Z"], DEFAULT_SAFEGUARD_LIMITS, now), "2026-11-19T00:00:00.000Z");
    assert.strictEqual(cooldownUntil(["2026-07-01T00:00:00Z", "2026-11-05T00:00:00Z"], DEFAULT_SAFEGUARD_LIMITS, now), null, "more than 60 days apart");
    assert.strictEqual(cooldownUntil(["2026-09-01T00:00:00Z", "2026-09-10T00:00:00Z"], DEFAULT_SAFEGUARD_LIMITS, now), null, "already over");
  });

  it("G1: nonsense limits are refused", () => {
    assert.deepStrictEqual(safeguardLimitProblems({ termHoursCap: 10 }), []);
    assert.ok(safeguardLimitProblems({ termHoursCap: 0 }).length > 0);
    assert.ok(safeguardLimitProblems({ attendanceMin: 120 }).length > 0);
    assert.ok(safeguardLimitProblems({ parallelProjects: { TIER_1: 3, TIER_2: 1, TIER_3: 2, TIER_4: 3 } }).length > 0, "a higher tier can't get fewer projects");
    assert.ok(safeguardLimitProblems({ breakPeriods: [{ id: "b", title: "Winter", startDate: "2026-12-30", endDate: "2026-12-01" }] }).length > 0);
  });

  it("D10: weeks run Monday to Sunday; working days skip weekends", () => {
    assert.strictEqual(weekStartOf("2026-11-10"), "2026-11-09");
    assert.strictEqual(weekStartOf("2026-11-15"), "2026-11-09", "Sunday belongs to the week that started on Monday");
    assert.strictEqual(workingDaysBetween(new Date("2026-11-13T10:00:00Z"), new Date("2026-11-17T10:00:00Z")), 2, "Fri → Tue = Mon, Tue");
  });

  it("G9: SLA state on read: paused wins over overdue; at risk near the deadline; submitted waits for staff", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const base: Allocation = { opportunityId: "o", studentId: "s", allocatedBy: "x", allocatedAt: "2026-11-01T00:00:00Z", status: "ACTIVE", slaStartAt: "2026-11-01T00:00:00Z", slaDeadline: "2026-11-09T00:00:00Z", kickoffAt: "2026-11-01T02:00:00Z" };
    assert.strictEqual(computeSla(base, now).state, "OVERDUE");
    assert.strictEqual(computeSla({ ...base, pauses: [{ from: "2026-11-08T00:00:00Z", reason: "Exams", by: "x" }] }, now).state, "PAUSED");
    const near = { ...base, slaDeadline: "2026-11-11T12:00:00Z", lastHoursAt: "2026-11-10T08:00:00Z" };
    assert.strictEqual(computeSla(near, now).state, "AT_RISK");
    assert.strictEqual(computeSla({ ...near, submissions: [{ id: "x", round: 1, link: "https://x.dev", submittedAt: "2026-11-10T09:00:00Z" }] }, now).state, "SUBMITTED");
    const fresh = { ...base, slaDeadline: "2026-12-30T00:00:00Z", allocatedAt: "2026-11-10T10:00:00Z", slaStartAt: "2026-11-10T10:00:00Z", kickoffAt: undefined };
    assert.strictEqual(computeSla(fresh, now).state, "NOT_STARTED");
    assert.strictEqual(computeSla({ ...base, status: "COMPLETED", onTime: false }, now).state, "COMPLETED_LATE");
  });

  it("F4: skill match ignores case and spelling differences and gives half credit for training", () => {
    const m = skillMatch(["react.js", "NODEJS"], ["React", "Node.js", "SQL", "Figma"], ["SQL Foundations"]);
    assert.deepStrictEqual(m.matched, ["React", "Node.js"]);
    assert.deepStrictEqual(m.trainedFor, ["SQL"]);
    assert.strictEqual(m.label, "2 of 4 skills + 1 from training");
    assert.strictEqual(m.percent, 63);
    assert.strictEqual(skillMatch([], ["React"]).percent, 0, "no skills listed yet");
    assert.strictEqual(skillMatch(["React"], []).percent, 100, "work with no listed skills is open to everyone");
  });
});

/* ------------------------------------------------------------------------------------------------ */
/* API                                                                                              */
/* ------------------------------------------------------------------------------------------------ */

describe("Phase 4: safeguards, hours and SLA (API)", () => {
  let server: Server;
  let baseUrl = "";
  const call = makeClient(() => baseUrl);
  const as = async (sid: string, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentTokens[sid]}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };
  const check = async (sid: string, opportunityId?: string) => (await call("GET", `/safeguards/${sid}${opportunityId ? `?opportunityId=${opportunityId}` : ""}`, { as: "admin" })).json.data;
  const rule = async (sid: string, name: string, opportunityId?: string) => (await check(sid, opportunityId)).rules.find((r: any) => r.rule === name);
  const allocate = (opportunityId: string, studentId: string, extra: Record<string, unknown> = {}) =>
    call("POST", `/opportunities/${opportunityId}/allocate`, { as: "admin", body: { studentId, reason: "Phase 4 test assignment", ...extra } });
  const allocation = async (opportunityId: string) => (await call("GET", `/opportunities/${opportunityId}/allocation`, { as: "admin" })).json.data;
  let originalLimits: unknown;
  const blackoutIds: string[] = [];

  const cleanup = async () => {
    await deleteConversationsForStudents(STUDENT_IDS);
    await deleteHelpRequestsForStudents(STUDENT_IDS);
    await deleteHoursDataForStudents(STUDENT_IDS);
    await deleteOverridesForStudents(STUDENT_IDS);
    await deleteSlaEventsFor(OPP_IDS);
    for (const id of STUDENT_IDS) await deleteTierSuggestionsForStudent(id);
    if (isDbConnected()) {
      await StudentModel.deleteMany({ id: { $in: STUDENT_IDS } });
      await AcademicSnapshotModel.deleteMany({ studentId: { $in: STUDENT_IDS } });
      await HourLogModel.deleteMany({ studentId: { $in: STUDENT_IDS } });
      await OpportunityModel.deleteMany({ id: { $in: OPP_IDS } });
      await BidModel.deleteMany({ opportunityId: { $in: OPP_IDS } });
      await AllocationModel.deleteMany({ opportunityId: { $in: OPP_IDS } });
      return;
    }
    const drop = <T,>(list: T[], match: (item: T) => boolean) => {
      for (let i = list.length - 1; i >= 0; i--) if (match(list[i])) list.splice(i, 1);
    };
    drop(mockStudents, (s) => STUDENT_IDS.includes(s.id));
    drop(mockAcademic, (a) => STUDENT_IDS.includes(a.studentId));
    drop(mockHours, (h) => STUDENT_IDS.includes(h.studentId));
    drop(mockOpportunities, (o) => OPP_IDS.includes(o.id));
    drop(mockBids, (b) => OPP_IDS.includes(b.opportunityId));
    drop(mockAllocations, (a) => OPP_IDS.includes(a.opportunityId));
  };

  before(async () => {
    ({ server, baseUrl } = await startTestServer());
    await cleanup();
    if (isDbConnected()) {
      await StudentModel.insertMany(STUDENTS);
      await AcademicSnapshotModel.insertMany(WITH_RECORDS.map(academic));
      await HourLogModel.insertMany(WITH_RECORDS.map(hourLog));
      await OpportunityModel.insertMany(OPPS);
      await AllocationModel.insertMany(LATE);
    } else {
      mockStudents.push(...STUDENTS.map((s) => ({ ...s })));
      mockAcademic.push(...WITH_RECORDS.map(academic));
      mockHours.push(...WITH_RECORDS.map(hourLog));
      mockOpportunities.push(...OPPS.map((o) => ({ ...o })));
      mockAllocations.push(...LATE.map((a) => ({ ...a })));
    }
    originalLimits = (await call("GET", "/safeguards/limits", { as: "admin" })).json.data;
  });

  after(async () => {
    // Put the institution's limits back exactly as they were
    if (originalLimits) await call("PUT", "/safeguards/limits", { as: "admin", body: originalLimits });
    for (const id of blackoutIds) await call("DELETE", `/blackouts/${id}`, { as: "admin" });
    await cleanup();
    await stopTestServer(server);
  });

  describe("Access control for the new endpoints", () => {
    it("ACL: 401 without a token on every new route", async () => {
      const routes: [string, string][] = [
        ["GET", "/safeguards/limits"], ["PUT", "/safeguards/limits"], ["POST", "/safeguards/overrides"], ["POST", "/safeguards/overrides/x/revoke"],
        ["GET", `/safeguards/${S.par}/overrides`], ["GET", `/hours/${S.par}/week`], ["POST", "/hours/timer/start"], ["POST", "/hours/timer/stop"],
        ["GET", `/checkins/${S.par}`], ["PUT", `/checkins/${S.par}/2026-11-02`], ["POST", "/blackouts"], ["DELETE", "/blackouts/x"],
        ["PUT", `/academic/${S.par}/compliance`], ["POST", `/opportunities/${O.light}/kickoff`], ["POST", `/opportunities/${O.light}/submissions`],
        ["POST", `/opportunities/${O.light}/submissions/x/review`], ["POST", `/opportunities/${O.light}/extension`], ["POST", `/opportunities/${O.light}/extension/x/decision`],
        ["POST", `/opportunities/${O.light}/pause`], ["POST", `/opportunities/${O.light}/resume`], ["POST", `/opportunities/${O.light}/cancel`],
        ["POST", `/opportunities/${O.light}/hand-back`], ["GET", `/opportunities/${O.light}/sla-events`], ["GET", "/sla/board"], ["POST", "/sla/run-checks"],
        ["GET", "/help-requests"], ["POST", "/help-requests"], ["POST", "/help-requests/x/resolve"],
      ];
      for (const [method, path] of routes) assert.strictEqual((await call(method, path)).status, 401, `${method} ${path}`);
    });

    it("ACL: 403 for roles without the permission", async () => {
      assert.strictEqual((await call("PUT", "/safeguards/limits", { as: "coordinator", body: { termHoursCap: 12 } })).status, 403, "SETTINGS_MANAGE only");
      assert.strictEqual((await call("POST", "/safeguards/overrides", { as: "analyst", body: { studentId: S.par, rule: "HOURS", reason: "Testing", days: 3 } })).status, 403);
      assert.strictEqual((await call("POST", "/blackouts", { as: "coordinator", body: {} })).status, 403, "BLACKOUT_MANAGE");
      assert.strictEqual((await call("PUT", `/academic/${S.par}/compliance`, { as: "coordinator", body: { attendancePercent: 80 } })).status, 403);
      assert.strictEqual((await call("POST", `/opportunities/${O.light}/kickoff`, { as: "admin" })).status, 403, "PROJECT_WORK is students only");
      assert.strictEqual((await call("POST", "/hours/timer/start", { as: "coordinator", body: { opportunityId: O.light } })).status, 403);
      assert.strictEqual((await call("POST", `/opportunities/${O.light}/pause`, { as: "analyst", body: { reason: "Exams week" } })).status, 403, "SLA_MANAGE");
      assert.strictEqual((await call("POST", `/opportunities/${O.light}/submissions/x/review`, { as: "dean", body: { decision: "ACCEPT" } })).status, 403);
      assert.strictEqual((await call("GET", "/sla/board", { as: "studentA" })).status, 403);
      assert.strictEqual((await call("GET", "/sla/board", { as: "editor" })).status, 403);
      assert.strictEqual((await call("POST", "/sla/run-checks", { as: "coordinator" })).status, 403);
      assert.strictEqual((await call("POST", "/help-requests", { as: "coordinator", body: { rule: "HOURS" } })).status, 403, "students ask");
      assert.strictEqual((await call("GET", "/help-requests", { as: "editor" })).status, 403);
      assert.strictEqual((await call("POST", "/help-requests/x/resolve", { as: "studentA", body: { outcome: "Done" } })).status, 403);
      assert.strictEqual((await as(S.par, "GET", `/hours/${S.hours}/week`)).status, 403, "another student's week");
      assert.strictEqual((await as(S.par, "PUT", `/checkins/${S.hours}/2026-11-02`, {})).status, 403, "another student's check-in");
    });

    it("ACL: allowed for the right roles", async () => {
      assert.strictEqual((await call("GET", "/safeguards/limits", { as: "studentA" })).status, 200, "everyone may read the limits");
      assert.strictEqual((await call("GET", "/sla/board", { as: "coordinator" })).status, 200);
      assert.strictEqual((await call("GET", "/help-requests", { as: "guild" })).status, 200);
      assert.strictEqual((await as(S.par, "GET", "/help-requests")).status, 200);
      assert.strictEqual((await as(S.par, "GET", `/hours/${S.par}/week`)).status, 200);
      assert.strictEqual((await call("GET", `/hours/${S.par}/week`, { as: "faculty" })).status, 200);
    });
  });

  describe("G1: limits", () => {
    it("G1: refuses nonsense limits and saves valid ones", async () => {
      assert.strictEqual((await call("PUT", "/safeguards/limits", { as: "admin", body: { termHoursCap: 0 } })).status, 400);
      assert.strictEqual((await call("PUT", "/safeguards/limits", { as: "admin", body: { unknown: 5 } })).status, 400);
      const saved = await call("PUT", "/safeguards/limits", { as: "admin", body: { termHoursCap: 11 } });
      assert.strictEqual(saved.status, 200);
      assert.strictEqual(saved.json.data.termHoursCap, 11);
      assert.strictEqual(saved.json.data.parallelProjects.TIER_3, 2, "other limits keep their values");
      await call("PUT", "/safeguards/limits", { as: "admin", body: { termHoursCap: (originalLimits as any).termHoursCap } });
    });
  });

  describe("F1: the safeguard check", () => {
    it("G2 / D10: a project whose weekly hours don't fit the cap is blocked at allocation, with the numbers", async () => {
      const hours = await rule(S.hours, "HOURS", O.heavy);
      assert.strictEqual(hours.outcome, "BLOCK");
      assert.match(hours.message, /30 h\/week for this project/);
      assert.strictEqual(hours.helpFrom, "GUILD_LEAD");
      assert.ok(hours.unlock, "says what unlocks it");
      const res = await allocate(O.heavy, S.hours);
      assert.strictEqual(res.status, 400);
      assert.match(res.json.message, /over the 10 h term cap/);
      // G6: hours questions go to the student's own mentor (named on their record)
      const help = await as(S.hours, "POST", "/help-requests", { rule: "HOURS", opportunityId: O.heavy });
      assert.strictEqual(help.status, 201);
      assert.strictEqual(help.json.data.routedRole, "GUILD_LEAD");
      assert.strictEqual(help.json.data.routedUserName, "Vikram Malhotra");
    });

    it("G5: a soft rule can be overridden with a reason and an expiry; the allocation then goes through", async () => {
      assert.strictEqual((await call("POST", "/safeguards/overrides", { as: "faculty", body: { studentId: S.hours, rule: "HOURS", reason: "x", days: 3 } })).status, 400, "reason too short");
      assert.strictEqual((await call("POST", "/safeguards/overrides", { as: "faculty", body: { studentId: S.hours, rule: "HOURS", reason: "Holiday week", days: 90 } })).status, 400, "30 days at most");
      const created = await call("POST", "/safeguards/overrides", { as: "faculty", body: { studentId: S.hours, rule: "HOURS", reason: "Holiday week, light coursework", days: 7 } });
      assert.strictEqual(created.status, 201);
      const lifted = await rule(S.hours, "HOURS", O.heavy);
      assert.strictEqual(lifted.outcome, "PASS");
      assert.strictEqual(lifted.override.reason, "Holiday week, light coursework");
      const res = await allocate(O.heavy, S.hours);
      assert.strictEqual(res.status, 200, res.json.message);
      assert.deepStrictEqual(res.json.data.milestones.map((m: any) => m.title), ["Research", "Build", "Handoff"], "F2a: a milestone per deliverable");
      const list = await as(S.hours, "GET", `/safeguards/${S.hours}/overrides`);
      assert.strictEqual(list.json.data.length, 1, "the student sees overrides on their own record");
    });

    it("D3: the parallel-project limit is a hard rule: blocked, and it can't be overridden", async () => {
      assert.strictEqual((await allocate(O.light, S.par, { slaDeadline: ymd(10) })).status, 200);
      const parallel = await rule(S.par, "PARALLEL", O.second);
      assert.strictEqual(parallel.outcome, "BLOCK");
      assert.strictEqual(parallel.hard, true);
      assert.strictEqual((await allocate(O.second, S.par)).status, 400);
      const override = await call("POST", "/safeguards/overrides", { as: "admin", body: { studentId: S.par, rule: "PARALLEL", reason: "Please allow two", days: 5 } });
      assert.strictEqual(override.status, 400);
      assert.match(override.json.message, /hard rule/);
      assert.strictEqual((await rule(S.par, "PARALLEL", O.light)).outcome, "PASS", "checking work the student already holds doesn't count it twice");
    });

    it("D3: TIER_3 may run two projects at once", async () => {
      assert.strictEqual((await allocate(O.clientDate, S.t3, { slaDeadline: ymd(10) })).status, 200);
      assert.strictEqual((await allocate(O.soon, S.t3)).status, 200);
    });

    it("G3: no official CGPA yet blocks; attendance below the minimum blocks but can be overridden", async () => {
      assert.strictEqual((await rule(S.norec, "CGPA_RECORDED")).outcome, "BLOCK");
      assert.strictEqual((await call("PUT", `/academic/${S.att}/compliance`, { as: "faculty", body: { attendancePercent: 101 } })).status, 400);
      const saved = await call("PUT", `/academic/${S.att}/compliance`, { as: "faculty", body: { attendancePercent: 60, activeBacklogs: 1 } });
      assert.strictEqual(saved.status, 200);
      assert.strictEqual(saved.json.data.complianceUpdatedBy, "Dr. Sarah Jenkins");
      const result = await check(S.att);
      assert.strictEqual(result.rules.find((r: any) => r.rule === "ATTENDANCE").outcome, "BLOCK");
      assert.strictEqual(result.complianceEligible, false, "the older flag follows the new rule");
      assert.ok(result.warnings.some((w: string) => /backlog/.test(w)));
      await call("POST", "/safeguards/overrides", { as: "coordinator", body: { studentId: S.att, rule: "ATTENDANCE", reason: "Medical leave, documented", days: 14 } });
      assert.strictEqual((await check(S.att)).eligible, true);
    });

    it("D5: two late deliveries within 60 days pause new allocations (soft: a coordinator can lift it)", async () => {
      const cool = await rule(S.cool, "COOLDOWN");
      assert.strictEqual(cool.outcome, "BLOCK");
      assert.strictEqual(cool.hard, false);
      assert.strictEqual((await allocate(O.exam, S.cool)).status, 400);
    });

    it("G4: an exam blackout for one programme blocks only that programme; the buffer days count", async () => {
      assert.strictEqual((await call("POST", "/blackouts", { as: "faculty", body: { title: "Mid-terms", startDate: ymd(5), endDate: ymd(3) } })).status, 400, "start after end");
      const created = await call("POST", "/blackouts", { as: "faculty", body: { title: `${PREFIX} Mid-terms`, startDate: ymd(1), endDate: ymd(6), programs: [`${PREFIX} Exam Programme`] } });
      assert.strictEqual(created.status, 201);
      blackoutIds.push(created.json.data.id);
      const exam = await rule(S.exam, "BLACKOUT");
      assert.strictEqual(exam.outcome, "BLOCK", "starts tomorrow: inside the 2-day buffer");
      assert.strictEqual(exam.hard, true);
      assert.strictEqual((await rule(S.att, "BLACKOUT")).outcome, "PASS", "another programme isn't affected");
      assert.strictEqual((await call("DELETE", `/blackouts/${created.json.data.id}`, { as: "admin" })).status, 200);
      blackoutIds.pop();
      assert.strictEqual((await rule(S.exam, "BLACKOUT")).outcome, "PASS");
    });

    it("G7: the health cards count students per rule", async () => {
      const res = await call("GET", "/safeguards", { as: "faculty" });
      assert.strictEqual(res.status, 200);
      const cgpa = res.json.data.find((c: any) => c.rule === "CGPA_RECORDED");
      assert.ok(cgpa.blockedCount >= 1, "at least the test student without a record");
      assert.ok(res.json.data.every((c: any) => typeof c.lastCheckedAt === "string"));
    });
  });

  describe("D10: weekly hours", () => {
    it("HOURS-02: one running timer per student, only on their own live project", async () => {
      assert.strictEqual((await as(S.par, "POST", "/hours/timer/start", { opportunityId: O.heavy })).status, 404, "not their project");
      const started = await as(S.par, "POST", "/hours/timer/start", { opportunityId: O.light });
      assert.strictEqual(started.status, 201);
      assert.strictEqual((await as(S.par, "POST", "/hours/timer/start", { opportunityId: O.light })).status, 409);
      const week = await as(S.par, "GET", `/hours/${S.par}/week`);
      assert.strictEqual(week.json.data.runningTimer.id, started.json.data.id);
      const stopped = await as(S.par, "POST", "/hours/timer/stop");
      assert.strictEqual(stopped.status, 200);
      assert.ok(stopped.json.data.endedAt);
      assert.strictEqual((await as(S.par, "POST", "/hours/timer/stop")).status, 409, "nothing running");
    });

    it("D10: the check-in is pre-filled with the plan; future weeks are refused; over the cap is recorded, never blocking", async () => {
      const view = await as(S.par, "GET", `/checkins/${S.par}`);
      assert.strictEqual(view.status, 200);
      assert.strictEqual(view.json.data.prefill.projects[0].opportunityId, O.light);
      const thisWeek = (await as(S.par, "GET", `/hours/${S.par}/week`)).json.data.summary.weekStart as string;
      const next = new Date(Date.parse(thisWeek) + 7 * DAY).toISOString().slice(0, 10);
      assert.strictEqual((await as(S.par, "PUT", `/checkins/${S.par}/${next}`, { projects: [] })).status, 400, "future week");
      assert.strictEqual((await as(S.par, "PUT", `/checkins/${S.par}/${ymd(0) === thisWeek ? ymd(1) : ymd(0)}`, {})).status, 400, "not a Monday");
      assert.strictEqual((await as(S.par, "PUT", `/checkins/${S.par}/${thisWeek}`, { projects: [{ opportunityId: O.heavy, actualHours: 2 }] })).status, 400, "not their project");
      const saved = await as(S.par, "PUT", `/checkins/${S.par}/${thisWeek}`, { projects: [{ opportunityId: O.light, actualHours: 9 }], otherPaidHours: 6, note: "Upwork logo job" });
      assert.strictEqual(saved.status, 200);
      assert.strictEqual(saved.json.data.totalHours, 15);
      assert.strictEqual(saved.json.data.overCap, true);
      const board = await call("GET", "/sla/board", { as: "guild" });
      assert.ok(board.json.data.overCap.some((c: any) => c.studentId === S.par), "mentors see it");
      // Outside paid work now counts toward the cap for new work
      assert.strictEqual((await check(S.par)).hours.otherPaidHours, 6);
    });
  });

  describe("F2 / G10: delivery lifecycle", () => {
    it("G10: kick-off once; F2a: a milestone is marked done once", async () => {
      assert.strictEqual((await as(S.par, "POST", `/opportunities/${O.heavy}/kickoff`)).status, 404, "another student's project");
      const kicked = await as(S.hours, "POST", `/opportunities/${O.heavy}/kickoff`);
      assert.strictEqual(kicked.status, 200);
      assert.strictEqual(kicked.json.data.status, "ACTIVE");
      assert.strictEqual((await as(S.hours, "POST", `/opportunities/${O.heavy}/kickoff`)).status, 409);
      const done = await as(S.hours, "POST", `/opportunities/${O.heavy}/milestones/ms-1/done`);
      assert.strictEqual(done.status, 200);
      assert.strictEqual(done.json.data.sla.milestonesDone, 1);
      assert.strictEqual((await as(S.hours, "POST", `/opportunities/${O.heavy}/milestones/ms-1/done`)).status, 409);
      assert.strictEqual((await as(S.hours, "POST", `/opportunities/${O.heavy}/milestones/ms-9/done`)).status, 404);
    });

    it("F2b: submissions need a link or a real PDF; one waits for review at a time", async () => {
      const path = `/opportunities/${O.heavy}/submissions`;
      assert.strictEqual((await as(S.hours, "POST", path, {})).status, 400);
      assert.strictEqual((await as(S.hours, "POST", path, { link: "javascript:alert(1)" })).status, 400);
      const fakePdf = `data:application/pdf;base64,${Buffer.from("<html>not a pdf</html>").toString("base64")}`;
      assert.strictEqual((await as(S.hours, "POST", path, { fileUrl: fakePdf })).status, 400, "checked by its bytes");
      const realPdf = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n%test\n").toString("base64")}`;
      const first = await as(S.hours, "POST", path, { link: "https://github.com/example/work", fileUrl: realPdf, fileName: "report.pdf", note: "First version" });
      assert.strictEqual(first.status, 201);
      assert.strictEqual(first.json.data.sla.state, "SUBMITTED");
      assert.strictEqual(first.json.data.submissions[0].fileUrl, undefined, "file contents never come back in lists");
      assert.strictEqual((await as(S.hours, "POST", path, { link: "https://github.com/example/again" })).status, 409);
      const subId = first.json.data.submissions[0].id;
      const file = await fetch(`${baseUrl}/opportunities/${O.heavy}/submissions/${subId}/file`, { headers: { Authorization: `Bearer ${studentTokens[S.hours]}` } });
      assert.strictEqual(file.status, 200);
      assert.strictEqual(file.headers.get("content-type"), "application/pdf");
      const other = await fetch(`${baseUrl}/opportunities/${O.heavy}/submissions/${subId}/file`, { headers: { Authorization: `Bearer ${studentTokens[S.par]}` } });
      assert.strictEqual(other.status, 404, "other students can't download it");
      const peek = await as(S.par, "GET", `/opportunities/${O.heavy}/allocation`);
      assert.strictEqual(peek.json.data.submissions, undefined, "other students don't see submissions");
      assert.ok(peek.json.data.sla);
    });

    it("F2b: two revision rounds are included; a third needs a coordinator; then accept (once)", async () => {
      const review = async (who: "analyst" | "coordinator", decision: string, feedback?: string) => {
        const current = await allocation(O.heavy);
        const sub = current.submissions.at(-1);
        return call("POST", `/opportunities/${O.heavy}/submissions/${sub.id}/review`, { as: who, body: { decision, feedback } });
      };
      const resubmit = () => as(S.hours, "POST", `/opportunities/${O.heavy}/submissions`, { link: "https://github.com/example/work" });
      assert.strictEqual((await review("analyst", "REVISION")).status, 400, "feedback required");
      assert.strictEqual((await review("analyst", "MAYBE")).status, 400);
      assert.strictEqual((await review("analyst", "REVISION", "Please add tests")).status, 200);
      assert.strictEqual((await resubmit()).status, 201);
      assert.strictEqual((await review("analyst", "REVISION", "Fix the layout")).status, 200);
      assert.strictEqual((await resubmit()).status, 201);
      assert.strictEqual((await review("analyst", "REVISION", "One more thing")).status, 403, "third revision");
      assert.strictEqual((await review("coordinator", "REVISION", "Final polish, approved by coordinator")).status, 200);
      assert.strictEqual((await resubmit()).status, 201);
      const accepted = await review("analyst", "ACCEPT", "Great work");
      assert.strictEqual(accepted.status, 200);
      assert.strictEqual(accepted.json.data.status, "COMPLETED");
      assert.strictEqual(accepted.json.data.onTime, true);
      assert.strictEqual(accepted.json.data.sla.state, "COMPLETED_ON_TIME");
      assert.strictEqual(accepted.json.data.sla.revisionsUsed, 3);
      const sub = (await allocation(O.heavy)).submissions.at(-1);
      assert.strictEqual((await call("POST", `/opportunities/${O.heavy}/submissions/${sub.id}/review`, { as: "coordinator", body: { decision: "ACCEPT" } })).status, 409, "accept twice");
      assert.strictEqual((await resubmit()).status, 409, "no submissions after delivery");
      const timeline = await as(S.hours, "GET", `/opportunities/${O.heavy}/sla-events`);
      const types = timeline.json.data.map((e: any) => e.type);
      for (const t of ["ALLOCATED", "KICKOFF", "MILESTONE_DONE", "SUBMITTED", "REVISION_REQUESTED", "ACCEPTED"]) assert.ok(types.includes(t), t);
      assert.strictEqual((await as(S.par, "GET", `/opportunities/${O.heavy}/sla-events`)).status, 404, "another student's timeline");
    });

    it("G10 / D4: one extension, at most 30% of the time, asked before the deadline; decided by a coordinator", async () => {
      const path = `/opportunities/${O.light}/extension`;
      assert.strictEqual((await as(S.par, "POST", path, { days: 9, reason: "Exams clash with the work" })).status, 400, "over 30% of 10 days");
      assert.strictEqual((await as(S.par, "POST", path, { days: 2, reason: "x" })).status, 400, "reason too short");
      const asked = await as(S.par, "POST", path, { days: 2, reason: "Exams clash with the work" });
      assert.strictEqual(asked.status, 201);
      assert.strictEqual((await as(S.par, "POST", path, { days: 1, reason: "Another request" })).status, 409, "two at once");
      const ext = asked.json.data.extensions[0];
      const before = asked.json.data.slaDeadline;
      assert.strictEqual((await call("POST", `/opportunities/${O.light}/extension/${ext.id}/decision`, { as: "analyst", body: { approve: true } })).status, 403);
      const approved = await call("POST", `/opportunities/${O.light}/extension/${ext.id}/decision`, { as: "coordinator", body: { approve: true, note: "OK" } });
      assert.strictEqual(approved.status, 200);
      assert.strictEqual(Date.parse(approved.json.data.slaDeadline) - Date.parse(before), 2 * DAY);
      assert.strictEqual(approved.json.data.originalSlaDeadline, before, "the original deadline is kept");
      assert.strictEqual((await call("POST", `/opportunities/${O.light}/extension/${ext.id}/decision`, { as: "coordinator", body: { approve: false } })).status, 409, "decided twice");
      assert.strictEqual((await as(S.par, "POST", path, { days: 1, reason: "Need one more day" })).status, 409, "one extension per project");
    });

    it("G10: an extension past the client's date needs the client's agreement", async () => {
      const asked = await as(S.t3, "POST", `/opportunities/${O.clientDate}/extension`, { days: 2, reason: "Client sent assets late" });
      assert.strictEqual(asked.status, 201);
      const id = asked.json.data.extensions[0].id;
      const refused = await call("POST", `/opportunities/${O.clientDate}/extension/${id}/decision`, { as: "admin", body: { approve: true } });
      assert.strictEqual(refused.status, 409);
      assert.match(refused.json.message, /client/);
      assert.strictEqual((await call("POST", `/opportunities/${O.clientDate}/extension/${id}/decision`, { as: "admin", body: { approve: true, clientAgreed: true } })).status, 200);
    });

    it("G10: pause wins over overdue; resume moves the deadline by the paused time", async () => {
      const before = (await allocation(O.light)).slaDeadline;
      assert.strictEqual((await call("POST", `/opportunities/${O.light}/pause`, { as: "coordinator", body: { reason: "x" } })).status, 400);
      const paused = await call("POST", `/opportunities/${O.light}/pause`, { as: "coordinator", body: { reason: "Mid-semester exams" } });
      assert.strictEqual(paused.status, 200);
      assert.strictEqual(paused.json.data.sla.state, "PAUSED");
      assert.strictEqual((await call("POST", `/opportunities/${O.light}/pause`, { as: "coordinator", body: { reason: "Again please" } })).status, 409);
      const resumed = await call("POST", `/opportunities/${O.light}/resume`, { as: "coordinator" });
      assert.strictEqual(resumed.status, 200);
      assert.ok(Date.parse(resumed.json.data.slaDeadline) >= Date.parse(before));
      assert.strictEqual((await call("POST", `/opportunities/${O.light}/resume`, { as: "coordinator" })).status, 409, "not paused");
    });

    it("Hand-back is recorded once and shows on the board; client cancellation ends the work without penalty", async () => {
      const hb = await as(S.t3, "POST", `/opportunities/${O.soon}/hand-back`, { reason: "Fell ill, doctor's note" });
      assert.strictEqual(hb.status, 200);
      assert.strictEqual((await as(S.t3, "POST", `/opportunities/${O.soon}/hand-back`, { reason: "Fell ill again" })).status, 409);
      const board = await call("GET", "/sla/board", { as: "coordinator" });
      assert.ok(board.json.data.items.some((i: any) => i.opportunityId === O.soon && i.handBackRequested));

      const cancelled = await call("POST", `/opportunities/${O.clientDate}/cancel`, { as: "coordinator", body: { reason: "Client cancelled the project" } });
      assert.strictEqual(cancelled.status, 200);
      assert.strictEqual(cancelled.json.data.status, "CANCELLED");
      assert.strictEqual((await call("GET", `/opportunities/${O.clientDate}`, { as: "admin" })).json.data.status, "CLOSED");
      assert.strictEqual((await as(S.t3, "POST", `/opportunities/${O.clientDate}/submissions`, { link: "https://x.dev/late" })).status, 409, "submit after cancellation");
      assert.strictEqual((await call("POST", `/opportunities/${O.clientDate}/delivery`, { as: "analyst" })).status, 409, "F2c: confirm delivery refuses cancelled work");
      const record = await call("GET", `/students/${S.t3}/delivery-record`, { as: "admin" });
      assert.strictEqual(record.json.data.completed, 0, "cancelled work isn't counted");
    });
  });

  describe("G12: reminders", () => {
    it("G12: a reminder due now is sent once, never twice (even on a second run)", async () => {
      const first = await call("POST", "/sla/run-checks", { as: "admin", body: { studentIds: [S.t3] } });
      assert.strictEqual(first.status, 200);
      assert.ok(first.json.data.remindersSent >= 1, "the project due in ~30 hours gets its 48-hour reminder");
      const second = await call("POST", "/sla/run-checks", { as: "admin", body: { studentIds: [S.t3] } });
      assert.strictEqual(second.json.data.remindersSent, 0);
      const inbox = await as(S.t3, "GET", "/messages");
      assert.ok(inbox.json.data.some((i: any) => /Due in 2 days|At risk/.test(i.conversation.subject)));
      assert.strictEqual((await call("POST", "/sla/run-checks", { as: "admin", body: { studentIds: "all" } })).status, 400);
    });
  });

  describe("G6: Request help", () => {
    it("HELP: a blocked student asks once per rule; it goes to the right person with the reason attached", async () => {
      assert.strictEqual((await as(S.norec, "POST", "/help-requests", { rule: "NOPE" })).status, 400);
      assert.strictEqual((await as(S.norec, "POST", "/help-requests", { rule: "PARALLEL" })).status, 400, "not blocking them");
      const asked = await as(S.norec, "POST", "/help-requests", { rule: "CGPA_RECORDED", message: "I joined last week" });
      assert.strictEqual(asked.status, 201);
      assert.strictEqual(asked.json.data.routedRole, "FACULTY_DIRECTOR");
      assert.strictEqual((await as(S.norec, "POST", "/help-requests", { rule: "CGPA_RECORDED" })).status, 409, "one open request per rule");
      const faculty = await call("GET", "/messages", { as: "faculty" });
      assert.ok(faculty.json.data.some((i: any) => i.conversation.id === asked.json.data.conversationId), "the faculty director has the thread");
      const thread = await as(S.norec, "GET", `/messages/${asked.json.data.conversationId}`);
      assert.match(thread.json.data.messages[0].body, /not been recorded|hasn't been recorded/);
    });

    it("HELP: parallel-limit questions go to the Cell Coordinator", async () => {
      const asked = await as(S.par, "POST", "/help-requests", { rule: "PARALLEL", opportunityId: O.second });
      assert.strictEqual(asked.status, 201);
      assert.strictEqual(asked.json.data.routedRole, "CELL_COORDINATOR");
    });

    it("HELP: only the routed role resolves; unanswered requests escalate after 2 working days", async () => {
      const list = await call("GET", "/help-requests?status=OPEN", { as: "faculty" });
      const mine = list.json.data.find((r: any) => r.studentId === S.norec);
      assert.ok(mine, "routed to faculty");
      assert.ok(!(await call("GET", "/help-requests", { as: "guild" })).json.data.some((r: any) => r.studentId === S.norec), "other roles don't see it");

      const later = new Date(Date.now() + 5 * DAY);
      const result = await escalateHelpRequestsService(later, [S.norec]);
      assert.strictEqual(result.escalated, 1);
      const moved = (await call("GET", "/help-requests", { as: "coordinator" })).json.data.find((r: any) => r.id === mine.id);
      assert.strictEqual(moved.routedRole, "CELL_COORDINATOR");
      assert.strictEqual(moved.escalationLevel, 1);
      assert.strictEqual((await escalateHelpRequestsService(later, [S.norec])).escalated, 0, "not again until another 2 working days pass");

      assert.strictEqual((await call("POST", `/help-requests/${mine.id}/resolve`, { as: "faculty", body: { outcome: "Recorded the CGPA" } })).status, 403, "now the coordinator's");
      const resolved = await call("POST", `/help-requests/${mine.id}/resolve`, { as: "coordinator", body: { outcome: "Asked faculty to record the CGPA today" } });
      assert.strictEqual(resolved.status, 200);
      assert.strictEqual(resolved.json.data.status, "RESOLVED");
      assert.strictEqual((await call("POST", `/help-requests/${mine.id}/resolve`, { as: "coordinator", body: { outcome: "Again" } })).status, 409);
      assert.strictEqual((await as(S.norec, "POST", "/help-requests", { rule: "CGPA_RECORDED" })).status, 201, "a new request is allowed once the old one is resolved");
    });
  });
});
