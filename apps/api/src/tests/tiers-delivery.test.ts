import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import { suggestTier, type AcademicSnapshot, type Allocation, type HourLog, type Opportunity, type Student, type TierEvaluationInput } from "@edurev/types";
import {
  academicSnapshots as mockAcademic,
  allocations as mockAllocations,
  hourLogs as mockHours,
  opportunities as mockOpportunities,
  students as mockStudents,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AcademicSnapshotModel, AllocationModel, HourLogModel, OpportunityModel, StudentModel } from "../models/index.js";
import { deleteTierSuggestionsForStudent } from "../services/onboarding.service.js";
import { createToken, makeClient, startTestServer, stopTestServer, type TestUser } from "./helpers.js";

const SID = "stu-test-tiers";
const TEMP_STUDENT: Student = {
  id: SID,
  name: "Tier Tester",
  email: "tier.tester@example.com",
  avatarInitials: "TT",
  program: "Computer Science",
  course: "B.Tech",
  year: 3,
  tier: "TIER_3",
  status: "ACTIVE",
  skills: ["React", "Node.js", "SQL"],
  trainingProgress: 80,
  progress: 80,
  cgpa: 9.5,
  joinedAt: "2026-01-10",
  projectsCompleted: 4,
  earnings: 0,
  mentor: "Elena Martin",
};
const ACADEMIC: AcademicSnapshot = { studentId: SID, cgpa: 9.5, requiredCgpa: 7, cgpaStatus: "ELIGIBLE", complianceStatus: "COMPLIANT" };
const HOURS: HourLog = { studentId: SID, period: "2026-W44", allowedHours: 20, loggedHours: 2, remainingHours: 18, status: "NORMAL" };
const SELF: TestUser = { id: "usr-test-tiers", name: "Tier Tester", email: "tier.tester@revalanche.local", role: "STUDENT", studentId: SID };

const OPP_MAIN = "opp-test-del-main"; // due far in the future → on time
const OPP_LATE = "opp-test-del-late"; // due in the past → late
const OPP_UNALLOCATED = "opp-test-del-none";
const PAST_IDS = ["opp-test-del-1", "opp-test-del-2", "opp-test-del-3", "opp-test-del-4"]; // already delivered on time
const ALL_OPP_IDS = [OPP_MAIN, OPP_LATE, OPP_UNALLOCATED, ...PAST_IDS];

function opportunity(id: string, deadline: string): Opportunity {
  return {
    id, title: id, project: id, description: "Delivery test", client: "Test Co", company: "Test Co", category: "Web development",
    skills: ["React"], budget: 1000, currency: "INR", deadline, status: "ALLOCATED", requiredTier: "TIER_1", estimatedHours: 5,
    numberOfBids: 1, slaDeadline: "2099-01-01T00:00:00.000Z", matchScore: 90, deliverables: ["Build"], updatedAt: "2026-10-01",
  };
}

const yesterday = new Date(Date.now() - 86400000).toISOString();
const allocation = (opportunityId: string, extra: Partial<Allocation> = {}): Allocation => ({
  opportunityId, studentId: SID, allocatedBy: "Test", allocatedAt: "2019-12-01T00:00:00.000Z", status: "ALLOCATED", slaStatus: "ACTIVE", ...extra,
});

const input = (overrides: Partial<TierEvaluationInput>): TierEvaluationInput => ({
  currentTier: "TIER_1", officialCgpa: 7, trainingPercent: 0, skillsCount: 0, completedDeliveries: 0, onTimeDeliveries: 0, ...overrides,
});

describe("Tier Rules, Academic Record & Delivery Suite", () => {
  let server: Server;
  let baseUrl = "";
  const call = makeClient(() => baseUrl);
  const selfToken = createToken(SELF);
  const asSelf = async (method: string, path: string) => {
    const res = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${selfToken}` } });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };

  const cleanup = async () => {
    await deleteTierSuggestionsForStudent(SID);
    if (isDbConnected()) {
      await StudentModel.deleteOne({ id: SID });
      await AcademicSnapshotModel.deleteOne({ studentId: SID });
      await HourLogModel.deleteOne({ studentId: SID });
      await AllocationModel.deleteMany({ studentId: SID });
      await OpportunityModel.deleteMany({ id: { $in: ALL_OPP_IDS } });
      return;
    }
    const drop = <T,>(list: T[], match: (item: T) => boolean) => {
      for (let i = list.length - 1; i >= 0; i--) if (match(list[i])) list.splice(i, 1);
    };
    drop(mockStudents, (s) => s.id === SID);
    drop(mockAcademic, (a) => a.studentId === SID);
    drop(mockHours, (h) => h.studentId === SID);
    drop(mockAllocations, (a) => a.studentId === SID);
    drop(mockOpportunities, (o) => ALL_OPP_IDS.includes(o.id));
  };

  before(async () => {
    ({ server, baseUrl } = await startTestServer());
    await cleanup();
    const opps = [opportunity(OPP_MAIN, "2099-12-31"), opportunity(OPP_LATE, "2020-01-01"), opportunity(OPP_UNALLOCATED, "2099-12-31"), ...PAST_IDS.map((id) => opportunity(id, "2099-12-31"))];
    const allocs = [
      allocation(OPP_MAIN),
      allocation(OPP_LATE),
      ...PAST_IDS.map((id) => allocation(id, { status: "COMPLETED", slaStatus: "COMPLETED", deliveredAt: yesterday, onTime: true })),
    ];
    if (isDbConnected()) {
      await StudentModel.create(TEMP_STUDENT);
      await AcademicSnapshotModel.create(ACADEMIC);
      await HourLogModel.create(HOURS);
      await OpportunityModel.insertMany(opps);
      await AllocationModel.insertMany(allocs);
    } else {
      mockStudents.push({ ...TEMP_STUDENT });
      mockAcademic.push({ ...ACADEMIC });
      mockHours.push({ ...HOURS });
      mockOpportunities.push(...opps);
      mockAllocations.push(...allocs);
    }
  });

  after(async () => {
    await cleanup();
    await stopTestServer(server);
  });

  describe("Shared tier rules", () => {
    it("bumps strong academics to TIER_2 or TIER_3", () => {
      assert.strictEqual(suggestTier(input({ officialCgpa: 9.1, trainingPercent: 65, skillsCount: 3 }))?.tier, "TIER_3");
      assert.strictEqual(suggestTier(input({ officialCgpa: 8.2, trainingPercent: 45, skillsCount: 2 }))?.tier, "TIER_2");
      assert.strictEqual(suggestTier(input({ officialCgpa: 9.6, trainingPercent: 45, skillsCount: 2 }))?.tier, "TIER_2", "TIER_3 also needs 60% training");
      assert.strictEqual(suggestTier(input({ officialCgpa: 7.9, trainingPercent: 100, skillsCount: 10 })), null);
    });

    it("never uses a missing official CGPA", () => {
      assert.strictEqual(suggestTier(input({ officialCgpa: null, trainingPercent: 100, skillsCount: 10 })), null);
    });

    it("reaches TIER_4 only through on-time delivery from TIER_3", () => {
      assert.strictEqual(suggestTier(input({ currentTier: "TIER_3", officialCgpa: 10, trainingPercent: 100, skillsCount: 20 })), null);
      assert.strictEqual(suggestTier(input({ currentTier: "TIER_3", officialCgpa: 7, completedDeliveries: 5, onTimeDeliveries: 5 }))?.tier, "TIER_4");
      assert.strictEqual(suggestTier(input({ currentTier: "TIER_3", completedDeliveries: 5, onTimeDeliveries: 4 })), null, "80% on time is not enough");
      assert.strictEqual(suggestTier(input({ currentTier: "TIER_2", completedDeliveries: 9, onTimeDeliveries: 9 })), null, "must be TIER_3 first");
    });

    it("never suggests moving a student down", () => {
      assert.strictEqual(suggestTier(input({ currentTier: "TIER_4", officialCgpa: 5 })), null);
      assert.strictEqual(suggestTier(input({ currentTier: "TIER_3", officialCgpa: 8.5, trainingPercent: 50, skillsCount: 3 })), null);
    });
  });

  describe("Official academic record", () => {
    const path = `/academic/${SID}`;

    it("can only be changed by a Faculty Director or Administrator", async () => {
      assert.strictEqual((await call("PUT", path, { body: { cgpa: 9 } })).status, 401);
      for (const as of ["studentA", "coordinator", "analyst", "dean"] as const) {
        assert.strictEqual((await call("PUT", path, { as, body: { cgpa: 9 } })).status, 403, as);
      }
    });

    it("validates and saves the CGPA, keeping eligibility in step", async () => {
      assert.strictEqual((await call("PUT", path, { as: "faculty", body: { cgpa: 11 } })).status, 400);
      assert.strictEqual((await call("PUT", path, { as: "faculty", body: { cgpa: "9" } })).status, 400);
      assert.strictEqual((await call("PUT", path, { as: "faculty", body: { cgpa: 9, requiredCgpa: -1 } })).status, 400);

      const low = await call("PUT", path, { as: "faculty", body: { cgpa: 6.4 } });
      assert.strictEqual(low.status, 200);
      assert.strictEqual(low.json.data.cgpaStatus, "RESTRICTED");

      const high = await call("PUT", path, { as: "admin", body: { cgpa: 9.456 } });
      assert.strictEqual(high.json.data.cgpa, 9.46);
      assert.strictEqual(high.json.data.cgpaStatus, "ELIGIBLE");
      assert.strictEqual((await asSelf("GET", `/students/${SID}`)).json.data.cgpa, 9.46, "profile CGPA kept in sync");
    });
  });

  describe("Delivery", () => {
    it("shows a delivery record to the student and staff only", async () => {
      assert.strictEqual((await call("GET", `/students/${SID}/delivery-record`)).status, 401);
      assert.strictEqual((await call("GET", `/students/${SID}/delivery-record`, { as: "studentA" })).status, 403);
      const own = await asSelf("GET", `/students/${SID}/delivery-record`);
      assert.strictEqual(own.status, 200);
      assert.deepStrictEqual(own.json.data, { studentId: SID, completed: 4, onTime: 4, onTimeRate: 100, active: 2 });
      assert.strictEqual((await call("GET", `/students/${SID}/delivery-record`, { as: "guild" })).status, 200);
    });

    it("lets only allocator roles confirm delivery", async () => {
      assert.strictEqual((await call("POST", `/opportunities/${OPP_MAIN}/delivery`)).status, 401);
      for (const as of ["studentA", "editor", "faculty", "dean"] as const) {
        assert.strictEqual((await call("POST", `/opportunities/${OPP_MAIN}/delivery`, { as })).status, 403, as);
      }
    });

    it("validates the delivery time and requires an allocation", async () => {
      assert.strictEqual((await call("POST", `/opportunities/${OPP_MAIN}/delivery`, { as: "analyst", body: { deliveredAt: "not a date" } })).status, 400);
      const future = new Date(Date.now() + 86400000).toISOString();
      assert.strictEqual((await call("POST", `/opportunities/${OPP_MAIN}/delivery`, { as: "analyst", body: { deliveredAt: future } })).status, 400);
      assert.strictEqual((await call("POST", `/opportunities/${OPP_UNALLOCATED}/delivery`, { as: "analyst" })).status, 404);
    });

    it("confirms an on-time delivery once, counts the project, and suggests TIER_4 after 5 on-time deliveries", async () => {
      const before = (await asSelf("GET", `/students/${SID}`)).json.data.projectsCompleted;
      const res = await call("POST", `/opportunities/${OPP_MAIN}/delivery`, { as: "analyst" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.data.status, "COMPLETED");
      assert.strictEqual(res.json.data.onTime, true);
      assert.strictEqual(res.json.data.deliveryConfirmedBy, "Elena Martin");
      assert.deepStrictEqual(res.json.record, { studentId: SID, completed: 5, onTime: 5, onTimeRate: 100, active: 1 });
      assert.deepStrictEqual(res.json.tierReview, { status: "PENDING", suggestedTier: "TIER_4" });
      assert.strictEqual((await asSelf("GET", `/students/${SID}`)).json.data.projectsCompleted, before + 1);

      assert.strictEqual((await call("POST", `/opportunities/${OPP_MAIN}/delivery`, { as: "coordinator" })).status, 409, "no double counting");
    });

    it("marks work delivered after its due date as late", async () => {
      const res = await call("POST", `/opportunities/${OPP_LATE}/delivery`, { as: "coordinator" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.data.onTime, false);
      assert.strictEqual(res.json.record.completed, 6);
      assert.strictEqual(res.json.record.onTimeRate, 83);
    });

    it("withdraws a pending suggestion once its criteria are no longer met", async () => {
      // The late delivery dropped the on-time rate to 83%, below the 90% needed for TIER_4
      const all = await call("GET", "/tier-suggestions", { as: "admin" });
      const mine = all.json.data.filter((s: { studentId: string }) => s.studentId === SID);
      assert.strictEqual(mine.filter((s: { status: string }) => s.status === "PENDING").length, 0);
      const withdrawn = mine.find((s: { decidedBy?: string }) => s.decidedBy?.startsWith("SYSTEM"));
      assert.ok(withdrawn, "kept as history, marked as decided by the system");
      assert.strictEqual(withdrawn.status, "DISMISSED");
    });
  });
});
