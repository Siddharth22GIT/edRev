import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import type { AcademicSnapshot, HourLog, Opportunity, Student, Tier } from "@edurev/types";
import {
  academicSnapshots as mockAcademic,
  allocations as mockAllocations,
  bids as mockBids,
  earnings as mockEarnings,
  hourLogs as mockHours,
  opportunities as mockOpportunities,
  students as mockStudents,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AcademicSnapshotModel, AllocationModel, BidModel, EarningsEntryModel, HourLogModel, OpportunityModel, StudentModel } from "../models/index.js";
import { deleteConversationsBySubjectPrefix } from "../services/messages.service.js";
import { deleteTierSuggestionsForStudent } from "../services/onboarding.service.js";
import { deleteSlaEventsFor } from "../services/sla.service.js";
import { dateInTimeZone, deadlineInstant, endOfDayInTimeZone } from "../utils/time.js";
import { createToken, makeClient, startTestServer, stopTestServer, type TestUser } from "./helpers.js";

// Phase 2: bids and allocation integrity (docs/modules/bids-and-allocation.md). Test names start with the edge-case ID.

const PREFIX = "P2T"; // every record this suite creates is marked with it
const STUDENT_IDS = [1, 2, 3, 4, 5].map((n) => `stu-p2t-${n}`);
const [S1, S2, S3, S4, S5] = STUDENT_IDS;

const student = (id: string, tier: Tier = "TIER_1"): Student => ({
  id, name: `${PREFIX} ${id}`, email: `${id}@example.com`, avatarInitials: "PT", program: "Computer Science", course: "B.Tech", year: 2,
  tier, status: "ACTIVE", skills: ["React"], trainingProgress: 50, progress: 50, cgpa: 8.5, joinedAt: "2026-01-10", projectsCompleted: 0, earnings: 0, mentor: "Elena Martin",
});
const academic = (studentId: string): AcademicSnapshot => ({ studentId, cgpa: 8.5, requiredCgpa: 7, cgpaStatus: "ELIGIBLE", complianceStatus: "COMPLIANT" });
const hours = (studentId: string): HourLog => ({ studentId, period: "2026-W44", allowedHours: 20, loggedHours: 0, remainingHours: 20, status: "NORMAL" });
const tokenUser = (studentId: string): TestUser => ({ id: `usr-${studentId}`, name: `${PREFIX} ${studentId}`, email: `${studentId}@revalanche.local`, role: "STUDENT", studentId });
const tokens = Object.fromEntries(STUDENT_IDS.map((id) => [id, createToken(tokenUser(id))]));

const opp = (id: string, extra: Partial<Opportunity> = {}): Opportunity => ({
  id, title: `${PREFIX} ${id}`, project: id, description: "Phase 2 test", client: "Test Co", company: "Test Co", category: "Web development",
  skills: ["React"], budget: 1000, currency: "INR", deadline: "2099-12-31", status: "OPEN", requiredTier: "TIER_1", estimatedHours: 5,
  numberOfBids: 0, slaDeadline: "2099-12-31T00:00:00.000Z", matchScore: 90, deliverables: ["Build"], updatedAt: "2026-10-30", ...extra,
});
const OPP = {
  race: "opp-p2t-race",
  allocated: "opp-p2t-allocated",
  closed: "opp-p2t-closed",
  pastClose: "opp-p2t-past-close",
  tier3: "opp-p2t-tier3",
  edit: "opp-p2t-edit",
  direct: "opp-p2t-direct",
};
const OPPS = [
  opp(OPP.race),
  opp(OPP.allocated, { status: "ALLOCATED", allocatedStudentId: "stu-201" }),
  opp(OPP.closed, { status: "CLOSED" }),
  opp(OPP.pastClose, { bidsCloseAt: "2020-01-01" }),
  opp(OPP.tier3, { requiredTier: "TIER_3" }),
  opp(OPP.edit),
  opp(OPP.direct, { deadline: "2020-01-01", slaDeadline: "2020-01-01T00:00:00.000Z" }), // client date already passed
];
const OPP_IDS = OPPS.map((o) => o.id);

const bidBody = (extra: Record<string, unknown> = {}) => ({ proposedAmount: 900, estimatedCompletionTime: "5 days", message: "Phase 2 test bid", relevantSkills: "React", ...extra });

describe("Bids & Allocation Suite (Phase 2)", () => {
  let server: Server;
  let baseUrl = "";
  const call = makeClient(() => baseUrl);
  const asStudent = async (sid: string, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens[sid]}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };
  const getOpp = async (id: string) => (await call("GET", `/opportunities/${id}`, { as: "analyst" })).json.data as Opportunity;
  const bidsOn = async (id: string) => (await call("GET", `/opportunities/${id}/bids`, { as: "analyst" })).json.data as { studentId: string; status: string; id: string }[];

  const cleanup = async () => {
    await deleteConversationsBySubjectPrefix(`Bid update: ${PREFIX}`);
    await deleteConversationsBySubjectPrefix(`Allocation update: ${PREFIX}`);
    // A confirmed delivery may create a tier suggestion for a test student
    for (const id of STUDENT_IDS) await deleteTierSuggestionsForStudent(id);
    // Phase 4: allocation and reassignment add entries to the project timeline
    await deleteSlaEventsFor(OPP_IDS);
    if (isDbConnected()) {
      await StudentModel.deleteMany({ id: { $in: STUDENT_IDS } });
      await AcademicSnapshotModel.deleteMany({ studentId: { $in: STUDENT_IDS } });
      await HourLogModel.deleteMany({ studentId: { $in: STUDENT_IDS } });
      await OpportunityModel.deleteMany({ id: { $in: OPP_IDS } });
      await BidModel.deleteMany({ opportunityId: { $in: OPP_IDS } });
      await AllocationModel.deleteMany({ opportunityId: { $in: OPP_IDS } });
      await EarningsEntryModel.deleteMany({ studentId: { $in: STUDENT_IDS } });
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
    drop(mockEarnings, (e) => STUDENT_IDS.includes(e.studentId));
  };

  before(async () => {
    ({ server, baseUrl } = await startTestServer());
    await cleanup();
    const students = STUDENT_IDS.map((id) => student(id));
    if (isDbConnected()) {
      await StudentModel.insertMany(students);
      await AcademicSnapshotModel.insertMany(STUDENT_IDS.map(academic));
      await HourLogModel.insertMany(STUDENT_IDS.map(hours));
      await OpportunityModel.insertMany(OPPS);
    } else {
      mockStudents.push(...students);
      mockAcademic.push(...STUDENT_IDS.map(academic));
      mockHours.push(...STUDENT_IDS.map(hours));
      mockOpportunities.push(...OPPS.map((o) => ({ ...o })));
    }
  });

  after(async () => {
    await cleanup();
    await stopTestServer(server);
  });

  describe("Access control for the new endpoints", () => {
    it("ACL: edit/withdraw are student-only; reassign needs ALLOCATION_REASSIGN", async () => {
      assert.strictEqual((await call("PATCH", `/opportunities/${OPP.edit}/bids/mine`, { body: { message: "x" } })).status, 401);
      assert.strictEqual((await call("PATCH", `/opportunities/${OPP.edit}/bids/mine`, { as: "analyst", body: { message: "x" } })).status, 403);
      assert.strictEqual((await call("POST", `/opportunities/${OPP.edit}/bids/mine/withdraw`)).status, 401);
      assert.strictEqual((await call("POST", `/opportunities/${OPP.edit}/bids/mine/withdraw`, { as: "coordinator" })).status, 403);
      assert.strictEqual((await call("POST", `/opportunities/${OPP.race}/reassign`, { body: { studentId: S1, reason: "testing" } })).status, 401);
      for (const as of ["studentA", "analyst", "faculty"] as const) {
        assert.strictEqual((await call("POST", `/opportunities/${OPP.race}/reassign`, { as, body: { studentId: S1, reason: "testing" } })).status, 403, as);
      }
    });
  });

  describe("Placing bids", () => {
    it("E2 / BID-04: no bids on allocated or closed work, and a bid never moves the status backwards", async () => {
      const allocated = await asStudent(S1, "POST", `/opportunities/${OPP.allocated}/bids`, bidBody());
      assert.strictEqual(allocated.status, 409);
      assert.match(allocated.json.message, /already been allocated/);
      assert.strictEqual((await getOpp(OPP.allocated)).status, "ALLOCATED");
      assert.strictEqual((await asStudent(S1, "POST", `/opportunities/${OPP.closed}/bids`, bidBody())).status, 409);
    });

    it("E2 / BID-05: no bids after bidsCloseAt", async () => {
      const res = await asStudent(S1, "POST", `/opportunities/${OPP.pastClose}/bids`, bidBody());
      assert.strictEqual(res.status, 409);
      assert.match(res.json.message, /Bidding closed/);
    });

    it("E4 / BID-06: work above the student's official tier is refused with 403", async () => {
      const res = await asStudent(S1, "POST", `/opportunities/${OPP.tier3}/bids`, bidBody());
      assert.strictEqual(res.status, 403);
      assert.match(res.json.message, /TIER 3/);
    });

    it("E4 / BID-08: the amount must be a positive number; above budget is allowed with a warning", async () => {
      for (const proposedAmount of ["abc", -5, "0"]) {
        assert.strictEqual((await asStudent(S1, "POST", `/opportunities/${OPP.edit}/bids`, bidBody({ proposedAmount }))).status, 400, String(proposedAmount));
      }
      const over = await asStudent(S1, "POST", `/opportunities/${OPP.edit}/bids`, bidBody({ proposedAmount: 5000 }));
      assert.strictEqual(over.status, 201);
      assert.ok(over.json.warnings.some((w: string) => /above the client's budget/.test(w)));
    });

    it("E3 / BID-01 / BID-02: simultaneous bids from five students are all counted, with unique ids", async () => {
      const results = await Promise.all(STUDENT_IDS.map((sid) => asStudent(sid, "POST", `/opportunities/${OPP.race}/bids`, bidBody())));
      assert.deepStrictEqual(results.map((r) => r.status), [201, 201, 201, 201, 201]);
      const ids = results.map((r) => r.json.data.id);
      assert.strictEqual(new Set(ids).size, 5);
      assert.ok(ids.every((id: string) => /^bid-[0-9a-f-]{36}$/.test(id)), "UUID ids");
      const after = await getOpp(OPP.race);
      assert.strictEqual(after.numberOfBids, 5, "no lost updates");
      assert.strictEqual(after.status, "UNDER_REVIEW");
    });

    it("E3 / BID-03: the same student bidding twice at once gets exactly one bid", async () => {
      const [a, b] = await Promise.all([1, 2].map(() => asStudent(S2, "POST", `/opportunities/${OPP.edit}/bids`, bidBody())));
      assert.deepStrictEqual([a.status, b.status].sort(), [201, 409]);
    });
  });

  describe("Editing and withdrawing", () => {
    it("E5 / BID-10: a student edits their own submitted bid", async () => {
      const res = await asStudent(S2, "PATCH", `/opportunities/${OPP.edit}/bids/mine`, { proposedAmount: 750, message: "Updated plan" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.data.proposedAmount, 750);
      assert.strictEqual(res.json.data.message, "Updated plan");
      assert.ok(res.json.data.editedAt);
      assert.strictEqual((await asStudent(S3, "PATCH", `/opportunities/${OPP.edit}/bids/mine`, { message: "x" })).status, 404, "no bid to edit");
      assert.strictEqual((await asStudent(S2, "PATCH", `/opportunities/${OPP.edit}/bids/mine`, {})).status, 400, "nothing to update");
    });

    it("E5 / BID-10: withdraw frees the slot, and bidding again revives the same record", async () => {
      const before = (await getOpp(OPP.edit)).numberOfBids;
      const withdrawn = await asStudent(S2, "POST", `/opportunities/${OPP.edit}/bids/mine/withdraw`);
      assert.strictEqual(withdrawn.status, 200);
      assert.strictEqual(withdrawn.json.data.status, "WITHDRAWN");
      assert.strictEqual((await getOpp(OPP.edit)).numberOfBids, before - 1);
      assert.strictEqual((await asStudent(S2, "POST", `/opportunities/${OPP.edit}/bids/mine/withdraw`)).status, 409, "already withdrawn");
      assert.strictEqual((await asStudent(S2, "PATCH", `/opportunities/${OPP.edit}/bids/mine`, { message: "x" })).status, 409, "withdrawn bids can't be edited");

      const again = await asStudent(S2, "POST", `/opportunities/${OPP.edit}/bids`, bidBody({ proposedAmount: 800 }));
      assert.strictEqual(again.status, 201);
      assert.strictEqual(again.json.data.id, withdrawn.json.data.id, "same record");
      assert.strictEqual(again.json.data.status, "SUBMITTED");
      assert.strictEqual((await getOpp(OPP.edit)).numberOfBids, before);
    });
  });

  describe("Allocation", () => {
    it("E1 / ALLOC-01: two staff allocating different students at the same moment: exactly one wins", async () => {
      const [a, b] = await Promise.all([
        call("POST", `/opportunities/${OPP.race}/allocate`, { as: "analyst", body: { studentId: S1 } }),
        call("POST", `/opportunities/${OPP.race}/allocate`, { as: "coordinator", body: { studentId: S2 } }),
      ]);
      assert.deepStrictEqual([a.status, b.status].sort(), [200, 409]);
      const winner = a.status === 200 ? S1 : S2;
      const loserMessage = (a.status === 409 ? a : b).json.message;
      assert.doesNotMatch(loserMessage, /E11000|duplicate key/, "friendly message");

      const bids = await bidsOn(OPP.race);
      assert.deepStrictEqual(bids.filter((x) => x.status === "ALLOCATED").map((x) => x.studentId), [winner], "only the winner's bid is ALLOCATED");
      assert.strictEqual(bids.filter((x) => x.status === "REJECTED").length, 4, "every other live bid is REJECTED");
      const o = await getOpp(OPP.race);
      assert.strictEqual(o.status, "ALLOCATED");
      assert.strictEqual(o.allocatedStudentId, winner);
    });

    it("E5 / BID-11: students who weren't picked get a message", async () => {
      const winner = (await getOpp(OPP.race)).allocatedStudentId!;
      const loser = STUDENT_IDS.find((id) => id !== winner)!;
      const inbox = await asStudent(loser, "GET", "/messages");
      assert.strictEqual(inbox.status, 200);
      assert.ok(inbox.json.data.some((item: any) => item.conversation.subject === `Bid update: ${PREFIX} ${OPP.race}`));
      const winnerInbox = await asStudent(winner, "GET", "/messages");
      assert.ok(!winnerInbox.json.data.some((item: any) => item.conversation.subject?.startsWith(`Bid update: ${PREFIX} ${OPP.race}`)), "the winner isn't told they lost");
    });

    it("E1 / ALLOC-02: allocating already-allocated work is refused (no silent overwrite)", async () => {
      const winner = (await getOpp(OPP.race)).allocatedStudentId!;
      const other = STUDENT_IDS.find((id) => id !== winner)!;
      const res = await call("POST", `/opportunities/${OPP.race}/allocate`, { as: "admin", body: { studentId: other } });
      assert.strictEqual(res.status, 409);
      assert.match(res.json.message, /Reassign/);
      assert.strictEqual((await getOpp(OPP.race)).allocatedStudentId, winner);
    });

    it("E7 / ALLOC-05: the delivery deadline is never in the past; a past date chosen by staff is refused", async () => {
      assert.strictEqual((await asStudent(S3, "POST", `/opportunities/${OPP.direct}/bids`, bidBody())).status, 201);
      const past = await call("POST", `/opportunities/${OPP.direct}/allocate`, { as: "analyst", body: { studentId: S3, slaDeadline: "2020-05-05" } });
      assert.strictEqual(past.status, 400);
    });

    it("D7 / ALLOC-03: only bidders can be allocated; an Administrator may assign directly with a reason", async () => {
      assert.strictEqual((await call("POST", `/opportunities/${OPP.direct}/allocate`, { as: "analyst", body: { studentId: S4 } })).status, 400, "S4 never bid");
      assert.strictEqual((await call("POST", `/opportunities/${OPP.direct}/allocate`, { as: "admin", body: { studentId: S4 } })).status, 400, "reason required");
      const direct = await call("POST", `/opportunities/${OPP.direct}/allocate`, { as: "admin", body: { studentId: S4, reason: "Client asked for this student" } });
      assert.strictEqual(direct.status, 200);
      assert.strictEqual(direct.json.data.directAssignmentReason, "Client asked for this student");
      // E7: the client's date (2020) has passed, so the agreed deadline falls back to about a week from now
      const due = new Date(direct.json.data.slaDeadline).getTime();
      assert.ok(due > Date.now() + 6 * 86400000 && due < Date.now() + 8 * 86400000, "about 7 days ahead");
    });
  });

  describe("Reassignment", () => {
    it("E1b: a coordinator moves the work to another bidder with a reason; history is kept", async () => {
      const from = (await getOpp(OPP.race)).allocatedStudentId!;
      const to = STUDENT_IDS.find((id) => id !== from)!;
      assert.strictEqual((await call("POST", `/opportunities/${OPP.race}/reassign`, { as: "coordinator", body: { studentId: to, reason: "" } })).status, 400, "reason required");
      assert.strictEqual((await call("POST", `/opportunities/${OPP.race}/reassign`, { as: "coordinator", body: { studentId: from, reason: "Same student" } })).status, 400, "same student");

      const res = await call("POST", `/opportunities/${OPP.race}/reassign`, { as: "coordinator", body: { studentId: to, reason: "Student fell ill" } });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.data.studentId, to);
      assert.deepStrictEqual(
        res.json.data.reassignments.map((r: any) => [r.fromStudentId, r.toStudentId, r.reason]),
        [[from, to, "Student fell ill"]]
      );
      const bids = await bidsOn(OPP.race);
      assert.strictEqual(bids.find((b) => b.studentId === to)?.status, "ALLOCATED");
      assert.strictEqual(bids.find((b) => b.studentId === from)?.status, "REJECTED");
      assert.strictEqual((await getOpp(OPP.race)).allocatedStudentId, to);
      const inbox = await asStudent(from, "GET", "/messages");
      assert.ok(inbox.json.data.some((item: any) => item.conversation.subject === `Allocation update: ${PREFIX} ${OPP.race}`), "previous student is told");
    });

    it("E1b: delivered work can't be reassigned, and the allocated student can't withdraw", async () => {
      const current = (await getOpp(OPP.race)).allocatedStudentId!;
      assert.strictEqual((await asStudent(current, "POST", `/opportunities/${OPP.race}/bids/mine/withdraw`)).status, 409);
      assert.strictEqual((await call("POST", `/opportunities/${OPP.race}/delivery`, { as: "analyst" })).status, 200);
      const other = STUDENT_IDS.find((id) => id !== current)!;
      assert.strictEqual((await call("POST", `/opportunities/${OPP.race}/reassign`, { as: "admin", body: { studentId: other, reason: "Too late now" } })).status, 409);
    });
  });

  describe("Earnings integrity", () => {
    const earning = { platformName: `${PREFIX} Upwork`, originalAmount: 123, originalCurrency: "INR", earningDate: "2026-10-01", evidence: "Phase 2 test" };

    it("E6 / EARN-01: the same earning sent twice at once is stored once", async () => {
      const [a, b] = await Promise.all([1, 2].map(() => asStudent(S5, "POST", "/earnings", earning)));
      assert.deepStrictEqual([a.status, b.status].sort(), [201, 409]);
    });

    it("E6 / EARN-02: two verifiers deciding at once: one succeeds, the other gets 409", async () => {
      const list = await asStudent(S5, "GET", "/earnings");
      const id = list.json.data.find((e: any) => e.platformName === earning.platformName).id;
      const [a, b] = await Promise.all([
        call("PATCH", `/earnings/${id}/verify`, { as: "faculty", body: { status: "VERIFIED" } }),
        call("PATCH", `/earnings/${id}/verify`, { as: "coordinator", body: { status: "REJECTED", rejectionReason: "Duplicate" } }),
      ]);
      assert.deepStrictEqual([a.status, b.status].sort(), [200, 409]);
    });
  });

  describe("Timezone", () => {
    it("E9: date-only deadlines end at midnight in the institution's timezone", () => {
      assert.strictEqual(endOfDayInTimeZone("2026-09-20", "Asia/Kolkata").toISOString(), "2026-09-20T18:29:59.999Z");
      assert.strictEqual(endOfDayInTimeZone("2026-09-20", "UTC").toISOString(), "2026-09-20T23:59:59.999Z");
      assert.strictEqual(dateInTimeZone(new Date("2026-10-29T20:00:00Z"), "Asia/Kolkata"), "2026-10-30", "01:30 in India is already the next day");
      assert.strictEqual(deadlineInstant("2026-11-01T10:00:00.000Z", "Asia/Kolkata")?.toISOString(), "2026-11-01T10:00:00.000Z", "full timestamps unchanged");
      assert.strictEqual(deadlineInstant("", "Asia/Kolkata"), null);
    });
  });
});
