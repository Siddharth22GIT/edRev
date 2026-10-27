import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import { can, PERMISSIONS, STAFF_ROLES, type Bid, type HourLog } from "@edurev/types";
import { bids as mockBids, hourLogs as mockHourLogs, opportunities as mockOpportunities, proposals as mockProposals } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { BidModel, HourLogModel, OpportunityModel, ProposalModel } from "../models/index.js";
import { makeClient, startTestServer, stopTestServer, testUsers } from "./helpers.js";

// A bid with an attached PDF that belongs to studentA, on an opportunity id reserved for this suite.
const TEST_OPP_ID = "opp-acl-test";
const TEST_BID: Bid = {
  id: "bid-acl-test",
  opportunityId: TEST_OPP_ID,
  studentId: testUsers.studentA.studentId,
  proposedAmount: 1000,
  estimatedCompletionTime: "3 days",
  message: "Access control test bid",
  relevantSkills: "Testing",
  proposalPdfUrl: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 access control test").toString("base64")}`,
  proposalPdfName: "acl-test.pdf",
  status: "SUBMITTED",
  createdAt: new Date().toISOString(),
};

describe("Access Control Suite (all modules)", () => {
  let server: Server;
  let baseUrl = "";
  const call = makeClient(() => baseUrl);

  const createdOpportunityIds: string[] = [];
  const createdProposalIds: string[] = [];
  let hourLogSnapshot: HourLog | null = null;

  before(async () => {
    ({ server, baseUrl } = await startTestServer());

    if (isDbConnected()) {
      await BidModel.deleteMany({ opportunityId: TEST_OPP_ID });
      await BidModel.create(TEST_BID);
      hourLogSnapshot = await HourLogModel.findOne({ studentId: "stu-202" }).lean<HourLog>();
    } else {
      mockBids.push({ ...TEST_BID });
      const log = mockHourLogs.find((l) => l.studentId === "stu-202");
      hourLogSnapshot = log ? { ...log } : null;
    }
  });

  after(async () => {
    if (isDbConnected()) {
      await BidModel.deleteMany({ opportunityId: TEST_OPP_ID });
      await OpportunityModel.deleteMany({ id: { $in: createdOpportunityIds } });
      await ProposalModel.deleteMany({ id: { $in: createdProposalIds } });
      if (hourLogSnapshot) {
        const { _id, __v, createdAt, updatedAt, ...fields } = hourLogSnapshot as any;
        await HourLogModel.replaceOne({ studentId: "stu-202" }, fields);
      }
    } else {
      const bidIndex = mockBids.findIndex((b) => b.id === TEST_BID.id);
      if (bidIndex >= 0) mockBids.splice(bidIndex, 1);
      for (const id of createdOpportunityIds) {
        const i = mockOpportunities.findIndex((o) => o.id === id);
        if (i >= 0) mockOpportunities.splice(i, 1);
      }
      for (const id of createdProposalIds) {
        const i = mockProposals.findIndex((p) => p.id === id);
        if (i >= 0) mockProposals.splice(i, 1);
      }
      const log = mockHourLogs.find((l) => l.studentId === "stu-202");
      if (log && hourLogSnapshot) {
        for (const key of Object.keys(log)) delete (log as any)[key];
        Object.assign(log, hourLogSnapshot);
      }
    }
    await stopTestServer(server);
  });

  describe("Shared permission map", () => {
    it("keeps STUDENT out of every staff-only permission", () => {
      assert.ok(!STAFF_ROLES.includes("STUDENT"));
      for (const permission of ["OPPORTUNITY_CREATE", "OPPORTUNITY_ALLOCATE", "TIER_UPDATE", "HOUR_CAP_OVERRIDE", "EARNINGS_VERIFY", "BID_REVIEW", "STUDENT_RECORDS_VIEW", "STUDENT_SUPERVISE"] as const) {
        assert.strictEqual(can("STUDENT", permission), false, permission);
      }
    });

    it("matches the documented role lists", () => {
      assert.deepStrictEqual([...PERMISSIONS.HOUR_CAP_OVERRIDE].sort(), ["ADMINISTRATOR", "CELL_COORDINATOR", "FACULTY_DIRECTOR"]);
      assert.deepStrictEqual([...PERMISSIONS.TIER_UPDATE], ["ADMINISTRATOR"]);
      assert.ok(can("DEAN", "EARNINGS_VERIFY"));
      assert.strictEqual(can(undefined, "PROPOSAL_CREATE"), false);
    });
  });

  describe("Health", () => {
    it("is public and reports whether the API is serving database or mock data", async () => {
      const res = await call("GET", "/health");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.db, isDbConnected() ? "connected" : "mock");
    });
  });

  describe("Opportunities", () => {
    it("requires authentication to list or view opportunities", async () => {
      assert.strictEqual((await call("GET", "/opportunities")).status, 401);
      assert.strictEqual((await call("GET", "/opportunities/opp-1024")).status, 401);
    });

    it("lets any signed-in role list and view opportunities", async () => {
      for (const as of ["studentA", "editor", "admin"] as const) {
        assert.strictEqual((await call("GET", "/opportunities", { as })).status, 200, as);
      }
      const detail = await call("GET", "/opportunities/opp-1024", { as: "studentA" });
      assert.strictEqual(detail.status, 200);
      assert.strictEqual(detail.json.data.id, "opp-1024");
    });

    it("only lets opportunity managers publish opportunities", async () => {
      const body = { title: "ACL test opportunity", company: "ACL Co", budget: 5000 };
      assert.strictEqual((await call("POST", "/opportunities", { body })).status, 401);
      assert.strictEqual((await call("POST", "/opportunities", { as: "studentA", body })).status, 403);
      assert.strictEqual((await call("POST", "/opportunities", { as: "editor", body })).status, 403);

      const created = await call("POST", "/opportunities", { as: "analyst", body });
      assert.strictEqual(created.status, 201);
      createdOpportunityIds.push(created.json.data.id);
    });

    it("keeps bid submission student-only and allocation manager-only", async () => {
      const bid = { proposedAmount: 1, estimatedCompletionTime: "1 day", message: "x", relevantSkills: "x" };
      assert.strictEqual((await call("POST", "/opportunities/opp-1024/bids", { as: "analyst", body: bid })).status, 403);
      assert.strictEqual((await call("POST", "/opportunities/opp-1024/allocate", { as: "studentA", body: { studentId: "stu-202" } })).status, 403);
      assert.strictEqual((await call("POST", "/opportunities/opp-1024/allocate", { as: "editor", body: { studentId: "stu-202" } })).status, 403);
    });
  });

  describe("Bids & proposal documents", () => {
    it("requires authentication to read bids, allocations and documents", async () => {
      assert.strictEqual((await call("GET", `/opportunities/${TEST_OPP_ID}/bids`)).status, 401);
      assert.strictEqual((await call("GET", `/opportunities/${TEST_OPP_ID}/allocation`)).status, 401);
      assert.strictEqual((await call("GET", `/opportunities/${TEST_OPP_ID}/bids/${TEST_BID.id}/proposal`)).status, 401);
    });

    it("shows reviewers every bid but a student only their own", async () => {
      const staff = await call("GET", `/opportunities/${TEST_OPP_ID}/bids`, { as: "analyst" });
      assert.strictEqual(staff.status, 200);
      assert.ok(staff.json.data.some((b: Bid) => b.id === TEST_BID.id));

      const owner = await call("GET", `/opportunities/${TEST_OPP_ID}/bids`, { as: "studentA" });
      assert.strictEqual(owner.status, 200);
      assert.ok(owner.json.data.length >= 1);
      assert.ok(owner.json.data.every((b: Bid) => b.studentId === "stu-202"));

      const other = await call("GET", `/opportunities/${TEST_OPP_ID}/bids`, { as: "studentB" });
      assert.strictEqual(other.status, 200);
      assert.deepStrictEqual(other.json.data, []);
    });

    it("serves a proposal document to its owner and reviewers only", async () => {
      const path = `/opportunities/${TEST_OPP_ID}/bids/${TEST_BID.id}/proposal`;
      assert.strictEqual((await call("GET", path, { as: "studentB" })).status, 403);

      const owner = await call("GET", path, { as: "studentA" });
      assert.strictEqual(owner.status, 200);
      assert.strictEqual(owner.headers.get("content-type"), "application/pdf");

      const reviewer = await call("GET", path, { as: "editor", headers: { Origin: "http://localhost:3000" } });
      assert.strictEqual(reviewer.status, 200);
      assert.match(reviewer.headers.get("access-control-expose-headers") || "", /Content-Disposition/i);
    });
  });

  describe("Students", () => {
    it("requires authentication for every student endpoint", async () => {
      for (const path of ["/students", "/students/stu-201", "/students/stu-201/readiness", "/students/stu-201/tier", "/students/stu-201/training"]) {
        assert.strictEqual((await call("GET", path)).status, 401, path);
      }
    });

    it("scopes the student list to the signed-in student", async () => {
      const own = await call("GET", "/students", { as: "studentA" });
      assert.strictEqual(own.status, 200);
      assert.deepStrictEqual(own.json.data.map((s: { id: string }) => s.id), ["stu-202"]);

      const staff = await call("GET", "/students", { as: "analyst" });
      assert.strictEqual(staff.status, 200);
      assert.ok(staff.json.data.length >= 3);
    });

    it("blocks a student from another student's profile, readiness, tier and training", async () => {
      for (const path of ["/students/stu-201", "/students/stu-201/readiness", "/students/stu-201/tier", "/students/stu-201/training"]) {
        assert.strictEqual((await call("GET", path, { as: "studentA" })).status, 403, path);
        assert.strictEqual((await call("GET", path, { as: "studentB" })).status, 200, path);
        assert.strictEqual((await call("GET", path, { as: "editor" })).status, 200, path);
      }
    });

    it("lets only the student themself or a supervisor update training", async () => {
      // An invalid status returns 400 *after* the access check, so these assertions never modify data.
      const body = { status: "NOT_A_STATUS" };
      assert.strictEqual((await call("PATCH", "/students/stu-202/training/tm3", { as: "studentB", body })).status, 403);
      assert.strictEqual((await call("PATCH", "/students/stu-202/training/tm3", { as: "analyst", body })).status, 403);
      assert.strictEqual((await call("PATCH", "/students/stu-202/training/tm3", { as: "studentA", body })).status, 400);
      assert.strictEqual((await call("PATCH", "/students/stu-202/training/tm3", { as: "guild", body })).status, 400);
    });

    it("keeps official tier changes administrator-only", async () => {
      const body = { tier: "NOT_A_TIER" };
      assert.strictEqual((await call("PATCH", "/students/stu-202/tier", { as: "studentA", body })).status, 403);
      assert.strictEqual((await call("PATCH", "/students/stu-202/tier", { as: "faculty", body })).status, 403);
      assert.strictEqual((await call("PATCH", "/students/stu-202/tier", { as: "admin", body })).status, 400);
    });
  });

  describe("Safeguards, hours & academic records", () => {
    it("requires authentication", async () => {
      for (const path of ["/safeguards", "/safeguards/stu-201", "/hours/stu-201", "/blackouts", "/academic/stu-201", "/settings"]) {
        assert.strictEqual((await call("GET", path)).status, 401, path);
      }
    });

    it("lets any signed-in role read the shared policy lists", async () => {
      for (const path of ["/safeguards", "/blackouts", "/settings"]) {
        assert.strictEqual((await call("GET", path, { as: "studentA" })).status, 200, path);
      }
    });

    it("limits per-student safeguard, hour and academic records to the student and staff", async () => {
      for (const path of ["/safeguards/stu-201", "/hours/stu-201", "/academic/stu-201"]) {
        assert.strictEqual((await call("GET", path, { as: "studentA" })).status, 403, path);
        assert.strictEqual((await call("GET", path, { as: "studentB" })).status, 200, path);
        assert.strictEqual((await call("GET", path, { as: "faculty" })).status, 200, path);
      }
    });

    it("lets students log only their own hours and supervisors log for a student", async () => {
      assert.strictEqual((await call("POST", "/hours", { body: { hours: 2 } })).status, 401);
      assert.strictEqual((await call("POST", "/hours", { as: "studentA", body: { studentId: "stu-201", hours: 2 } })).status, 403);

      const own = await call("POST", "/hours", { as: "studentA", body: { hours: 2 } });
      assert.strictEqual(own.status, 201);
      assert.strictEqual(own.json.data.studentId, "stu-202");

      assert.strictEqual((await call("POST", "/hours", { as: "analyst", body: { studentId: "stu-201", hours: 2 } })).status, 403);
      assert.strictEqual((await call("POST", "/hours", { as: "guild", body: { hours: 2 } })).status, 400);
      assert.strictEqual((await call("POST", "/hours", { as: "guild", body: { studentId: "stu-201", hours: 2 } })).status, 201);
    });

    it("authorizes hour-cap overrides from the token, not from a role in the request body", async () => {
      const path = "/safeguards/hour-cap/override";
      assert.strictEqual((await call("POST", path, { body: { studentId: "stu-202", reason: "x" } })).status, 401);
      assert.strictEqual((await call("POST", path, { as: "studentA", body: { studentId: "stu-202", reason: "x" } })).status, 403);
      // Spoofing the old body `role` field no longer grants access
      assert.strictEqual(
        (await call("POST", path, { as: "analyst", body: { studentId: "stu-202", role: "FACULTY_DIRECTOR", reason: "x" } })).status,
        403
      );
      assert.strictEqual((await call("POST", path, { as: "coordinator", body: { studentId: "stu-202" } })).status, 400);
    });

    it("records who approved an hour-cap override and why", async () => {
      const reason = "Approved for a final-week client deliverable";
      const res = await call("POST", "/safeguards/hour-cap/override", { as: "coordinator", body: { studentId: "stu-202", reason } });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.approvedBy, "CELL_COORDINATOR");
      assert.strictEqual(res.json.approverId, testUsers.coordinator.id);
      assert.strictEqual(res.json.data.overridden, true);
      assert.strictEqual(res.json.data.overrideReason, reason);
      assert.strictEqual(res.json.data.overriddenBy, `CELL_COORDINATOR:${testUsers.coordinator.id}`);
    });
  });

  describe("Proposals", () => {
    it("requires authentication to list or create proposals", async () => {
      assert.strictEqual((await call("GET", "/proposals")).status, 401);
      assert.strictEqual((await call("POST", "/proposals", { body: { title: "x" } })).status, 401);
      assert.strictEqual((await call("GET", "/proposals", { as: "studentA" })).status, 200);
    });

    it("records a student's proposal under their own name, ignoring a spoofed name", async () => {
      const res = await call("POST", "/proposals", {
        as: "studentA",
        body: { title: "ACL student proposal", studentName: "Someone Else", author: "Someone Else", opportunityId: "opp-1024" },
      });
      assert.strictEqual(res.status, 201);
      createdProposalIds.push(res.json.data.id);
      assert.strictEqual(res.json.data.studentName, testUsers.studentA.name);
      assert.strictEqual(res.json.data.author, testUsers.studentA.name);
    });

    it("lets staff create a proposal on a student's behalf", async () => {
      const res = await call("POST", "/proposals", {
        as: "editor",
        body: { title: "ACL editor proposal", studentName: "Maya Chen", opportunityId: "opp-1024" },
      });
      assert.strictEqual(res.status, 201);
      createdProposalIds.push(res.json.data.id);
      assert.strictEqual(res.json.data.studentName, "Maya Chen");
    });
  });
});
