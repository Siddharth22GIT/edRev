import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import type { AcademicSnapshot, HourLog, Student, TierSuggestion } from "@edurev/types";
import { academicSnapshots as mockAcademic, hourLogs as mockHours, students as mockStudents } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AcademicSnapshotModel, HourLogModel, StudentModel } from "../models/index.js";
import { deleteTierSuggestionsForStudent } from "../services/onboarding.service.js";
import { createToken, makeClient, startTestServer, stopTestServer, type TestUser } from "./helpers.js";

// A temporary TIER_1 student whose real record qualifies for TIER_3 under the shared TIER_RULES:
// official CGPA 9.2 (≥9.0), training 70% (≥60); skills come from onboarding (≥3 needed).
const SID = "stu-test-onboard";
const TEMP_STUDENT: Student = {
  id: SID,
  name: "Onboarding Tester",
  email: "onboarding.tester@example.com",
  avatarInitials: "OT",
  program: "Computer Science",
  course: "B.Tech",
  year: 2,
  tier: "TIER_1",
  status: "ACTIVE",
  skills: [],
  trainingProgress: 70,
  progress: 70,
  cgpa: 9.2,
  joinedAt: "2026-07-01",
  projectsCompleted: 3,
  earnings: 0,
  mentor: "Elena Martin",
};
const ACADEMIC: AcademicSnapshot = { studentId: SID, cgpa: 9.2, requiredCgpa: 7, cgpaStatus: "ELIGIBLE", complianceStatus: "COMPLIANT" };
const HOURS: HourLog = { studentId: SID, period: "2026-W44", allowedHours: 20, loggedHours: 4, remainingHours: 16, status: "NORMAL" };
const TEMP_USER: TestUser = { id: "usr-test-onboard", name: TEMP_STUDENT.name, email: "onboard.tester@revalanche.local", role: "STUDENT", studentId: SID };

const VALID = {
  skills: ["React", "SQL", "Figma"],
  interests: ["Web development", "Data analysis"],
  claimedCgpa: 7,
  availabilityHours: 12,
  goals: "Ship a real client project this semester.",
  portfolioLinks: [{ label: "GitHub", url: "https://github.com/onboarding-tester" }],
};

describe("Onboarding & Tier Suggestion Suite", () => {
  let server: Server;
  let baseUrl = "";
  const call = makeClient(() => baseUrl);
  const selfToken = createToken(TEMP_USER);

  const asSelf = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${selfToken}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };

  const removeTempRecords = async () => {
    await deleteTierSuggestionsForStudent(SID);
    if (isDbConnected()) {
      await StudentModel.deleteOne({ id: SID });
      await AcademicSnapshotModel.deleteOne({ studentId: SID });
      await HourLogModel.deleteOne({ studentId: SID });
    } else {
      for (const list of [mockStudents, mockAcademic, mockHours] as { id?: string; studentId?: string }[][]) {
        const i = list.findIndex((item) => item.id === SID || item.studentId === SID);
        if (i >= 0) list.splice(i, 1);
      }
    }
  };

  before(async () => {
    ({ server, baseUrl } = await startTestServer());
    await removeTempRecords();
    if (isDbConnected()) {
      await StudentModel.create(TEMP_STUDENT);
      await AcademicSnapshotModel.create(ACADEMIC);
      await HourLogModel.create(HOURS);
    } else {
      mockStudents.push({ ...TEMP_STUDENT, skills: [] });
      mockAcademic.push({ ...ACADEMIC });
      mockHours.push({ ...HOURS });
    }
  });

  after(async () => {
    await removeTempRecords();
    await stopTestServer(server);
  });

  describe("Access", () => {
    it("requires authentication and limits onboarding to the student themself (or an admin)", async () => {
      assert.strictEqual((await call("PUT", `/students/${SID}/onboarding`, { body: VALID })).status, 401);
      assert.strictEqual((await call("POST", `/students/${SID}/onboarding/skip`)).status, 401);
      for (const as of ["studentA", "faculty", "guild"] as const) {
        assert.strictEqual((await call("PUT", `/students/${SID}/onboarding`, { as, body: VALID })).status, 403, as);
        assert.strictEqual((await call("POST", `/students/${SID}/onboarding/skip`, { as })).status, 403, as);
      }
    });

    it("keeps tier suggestions administrator-only", async () => {
      assert.strictEqual((await call("GET", "/tier-suggestions")).status, 401);
      for (const as of ["studentA", "faculty", "dean", "coordinator"] as const) {
        assert.strictEqual((await call("GET", "/tier-suggestions", { as })).status, 403, as);
        assert.strictEqual((await call("POST", "/tier-suggestions/anything/approve", { as })).status, 403, as);
      }
      assert.strictEqual((await call("GET", "/tier-suggestions", { as: "admin" })).status, 200);
      assert.strictEqual((await call("GET", "/tier-suggestions?status=MAYBE", { as: "admin" })).status, 400);
      assert.strictEqual((await call("POST", "/tier-suggestions/does-not-exist/approve", { as: "admin" })).status, 404);
    });
  });

  describe("Validation", () => {
    const path = `/students/${SID}/onboarding`;
    const cases: [string, Record<string, unknown>][] = [
      ["no skills", { ...VALID, skills: [] }],
      ["skills not a list", { ...VALID, skills: "React" }],
      ["unknown interest", { ...VALID, interests: ["Crypto trading"] }],
      ["no interests", { ...VALID, interests: [] }],
      ["CGPA above 10", { ...VALID, claimedCgpa: 11 }],
      ["CGPA as text", { ...VALID, claimedCgpa: "9" }],
      ["hours above the weekly cap", { ...VALID, availabilityHours: 25 }],
      ["fractional hours", { ...VALID, availabilityHours: 7.5 }],
      ["javascript link", { ...VALID, portfolioLinks: [{ label: "x", url: "javascript:alert(1)" }] }],
      ["link with a login inside", { ...VALID, portfolioLinks: [{ label: "x", url: "https://user:secret@example.com" }] }],
      ["too many links", { ...VALID, portfolioLinks: Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, url: `https://example.com/${i}` })) }],
      ["goals too long", { ...VALID, goals: "x".repeat(301) }],
    ];
    for (const [name, body] of cases) {
      it(`rejects ${name}`, async () => {
        assert.strictEqual((await asSelf("PUT", path, body)).status, 400);
      });
    }
  });

  describe("Flow", () => {
    it("lets a student skip for now", async () => {
      const res = await asSelf("POST", `/students/${SID}/onboarding/skip`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.json.data.onboardingSkippedAt);
      assert.strictEqual(res.json.data.onboardingCompletedAt, undefined);
    });

    it("saves answers, keeps official records untouched, and creates a pending tier suggestion", async () => {
      const res = await asSelf("PUT", `/students/${SID}/onboarding`, { ...VALID, tier: "TIER_4", cgpa: 10, earnings: 99999 });
      assert.strictEqual(res.status, 200);
      const student = res.json.data;
      assert.ok(student.onboardingCompletedAt);
      assert.deepStrictEqual(student.skills, VALID.skills);
      assert.deepStrictEqual(student.interests, VALID.interests);
      assert.strictEqual(student.claimedCgpa, 7);
      // Official fields are not changed by onboarding
      assert.strictEqual(student.tier, "TIER_1");
      assert.strictEqual(student.cgpa, 9.2);
      assert.strictEqual(student.earnings, 0);
      // The student only sees that a review is pending
      assert.deepStrictEqual(res.json.tierReview, { status: "PENDING", suggestedTier: "TIER_3" });

      const list = await call("GET", "/tier-suggestions?status=PENDING", { as: "admin" });
      const mine: TierSuggestion[] = list.json.data.filter((s: TierSuggestion) => s.studentId === SID);
      assert.strictEqual(mine.length, 1);
      assert.strictEqual(mine[0].currentTier, "TIER_1");
      assert.strictEqual(mine[0].suggestedTier, "TIER_3");
      assert.ok(mine[0].notes.some((n) => n.includes("differs from the official")), "flags the claimed vs official CGPA gap");
    });

    it("refreshes the same pending suggestion instead of creating duplicates", async () => {
      await asSelf("PUT", `/students/${SID}/onboarding`, VALID);
      const list = await call("GET", "/tier-suggestions?status=PENDING", { as: "admin" });
      assert.strictEqual(list.json.data.filter((s: TierSuggestion) => s.studentId === SID).length, 1);
    });

    it("lets an admin dismiss a suggestion without changing the tier", async () => {
      const pending = (await call("GET", "/tier-suggestions?status=PENDING", { as: "admin" })).json.data.find((s: TierSuggestion) => s.studentId === SID);
      const dismissed = await call("POST", `/tier-suggestions/${pending.id}/dismiss`, { as: "admin" });
      assert.strictEqual(dismissed.status, 200);
      assert.strictEqual(dismissed.json.data.status, "DISMISSED");
      assert.strictEqual(dismissed.json.data.decidedBy, "ADMINISTRATOR:usr-admin");
      assert.strictEqual((await call("POST", `/tier-suggestions/${pending.id}/approve`, { as: "admin" })).status, 409);

      const profile = await asSelf("GET", `/students/${SID}`);
      assert.strictEqual(profile.json.data.tier, "TIER_1");
    });

    it("applies the official tier only when an admin approves", async () => {
      const again = await asSelf("PUT", `/students/${SID}/onboarding`, VALID);
      assert.strictEqual(again.json.tierReview.status, "PENDING");
      const pending = (await call("GET", "/tier-suggestions?status=PENDING", { as: "admin" })).json.data.find((s: TierSuggestion) => s.studentId === SID);

      const approved = await call("POST", `/tier-suggestions/${pending.id}/approve`, { as: "admin" });
      assert.strictEqual(approved.status, 200);
      assert.strictEqual(approved.json.data.status, "APPROVED");
      assert.strictEqual((await asSelf("GET", `/students/${SID}`)).json.data.tier, "TIER_3");

      // Once at TIER_3, academics alone never reach TIER_4 (that needs a delivery record)
      const after = await asSelf("PUT", `/students/${SID}/onboarding`, VALID);
      assert.strictEqual(after.json.tierReview, null);
    });
  });
});
