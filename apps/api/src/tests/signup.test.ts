import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import type { SettingsSummary, User } from "@edurev/types";
import { isDbConnected } from "../config/db.js";
import { AcademicSnapshotModel, SettingsModel, StudentModel, UserModel } from "../models/index.js";
import { deleteSignupAccount } from "../services/signup.service.js";
import { resetRateLimits } from "../utils/rate-limit.js";
import { makeClient, startTestServer, stopTestServer } from "./helpers.js";

// Plenty of headroom for this suite; the limits themselves are tested explicitly below
process.env.SIGNUP_RATE_LIMIT = "1000";
process.env.LOGIN_FAILURE_LIMIT = "1000";

const PASSWORD = "Campus2026";
const A = { name: "Asha Verma", email: "test.signup.asha@lpu.in", registrationNumber: "TESTSU0001" };
const B = { name: "Kabir Rao", email: "test.signup.kabir@lpu.in", registrationNumber: "TESTSU0002" };
const ALL_EMAILS = [A.email, B.email, "test.signup.bot@lpu.in", "test.signup.other@lpu.in"];

const form = (person: { name: string; email: string; registrationNumber: string }, extra: Record<string, unknown> = {}) => ({
  ...person,
  password: PASSWORD,
  program: "Computer Science and Engineering",
  course: "B.Tech",
  year: 2,
  acceptSafeguards: true,
  ...extra,
});

describe("Student Sign-up Suite", () => {
  let server: Server;
  let baseUrl = "";
  const call = makeClient(() => baseUrl);
  let settingsSnapshot: Pick<SettingsSummary, "signupEnabled" | "allowedSignupDomains"> | null = null;

  const signup = (body: unknown) => call("POST", "/auth/signup", { body });
  const login = (email: string, password = PASSWORD) => call("POST", "/auth/login", { body: { email, password } });
  const userCount = async (email: string) => (isDbConnected() ? UserModel.countDocuments({ email: email.toLowerCase() }) : 0);
  const findUser = async (email: string) => UserModel.findOne({ email }).lean<User>();
  const requestFor = async (email: string, as: "admin" | "coordinator" = "admin") =>
    (await call("GET", "/signup-requests", { as })).json.data.find((r: { email: string }) => r.email === email);

  const cleanup = async () => {
    for (const email of ALL_EMAILS) await deleteSignupAccount(email);
  };

  before(async () => {
    ({ server, baseUrl } = await startTestServer());
    resetRateLimits();
    await cleanup();
    if (isDbConnected()) {
      const stored = await SettingsModel.findOne({ id: "default" }).lean<SettingsSummary>();
      settingsSnapshot = { signupEnabled: stored?.signupEnabled, allowedSignupDomains: stored?.allowedSignupDomains };
    }
  });

  after(async () => {
    await cleanup();
    if (isDbConnected() && settingsSnapshot) {
      const unset: Record<string, ""> = {};
      const set: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(settingsSnapshot)) {
        if (value === undefined || (Array.isArray(value) && value.length === 0)) unset[key] = "";
        else set[key] = value;
      }
      await SettingsModel.updateOne({ id: "default" }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
    }
    resetRateLimits();
    await stopTestServer(server);
  });

  it("leaves existing accounts signing in as before", async () => {
    assert.strictEqual((await login("student@revalanche.local", "Password123!")).status, 200);
    assert.strictEqual((await login("STUDENT@revalanche.local", "Password123!")).status, 200, "email is not case-sensitive");
  });

  describe("Demo data mode", () => {
    it("turns sign-up off when no database is connected", async (t) => {
      if (isDbConnected()) return t.skip("database connected");
      assert.strictEqual((await call("GET", "/auth/signup-config")).json.data.enabled, false);
      assert.strictEqual((await signup(form(A))).status, 503);
      assert.deepStrictEqual((await call("GET", "/signup-requests", { as: "admin" })).json.data, []);
    });
  });

  describe("Sign-up rules", () => {
    it("publishes whether sign-ups are open and for which domain", async (t) => {
      if (!isDbConnected()) return t.skip("demo data mode");
      const res = await call("GET", "/auth/signup-config");
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.json.data, { enabled: true, domains: ["lpu.in"] });
    });

    it("accepts only exact @lpu.in addresses", async (t) => {
      if (!isDbConnected()) return t.skip("demo data mode");
      for (const email of ["someone@gmail.com", "someone@lpu.in.com", "someone@student.lpu.in", "someone@lpu.inn"]) {
        assert.strictEqual((await signup(form({ ...A, email }))).status, 400, email);
      }
    });

    it("validates every field", async (t) => {
      if (!isDbConnected()) return t.skip("demo data mode");
      const bad: [string, Record<string, unknown>][] = [
        ["name", { name: "A" }],
        ["name with digits", { name: "R2D2" }],
        ["weak password", { password: "lettersonly" }],
        ["short password", { password: "abc12" }],
        ["password equals email", { password: A.email }],
        ["registration number", { registrationNumber: "12" }],
        ["registration number symbols", { registrationNumber: "AB-12/34" }],
        ["program", { program: "Astrology" }],
        ["course", { course: "PhD" }],
        ["year", { year: 6 }],
        ["safeguards not accepted", { acceptSafeguards: false }],
      ];
      for (const [label, extra] of bad) {
        assert.strictEqual((await signup(form(A, extra))).status, 400, label);
      }
      assert.strictEqual(await userCount(A.email), 0, "nothing was created");
    });

    it("creates a pending STUDENT account no matter what role is sent", async (t) => {
      if (!isDbConnected()) return t.skip("demo data mode");
      const res = await signup(form(A, { role: "ADMINISTRATOR", status: "ACTIVE", email: "  Test.Signup.Asha@LPU.IN " }));
      assert.strictEqual(res.status, 202);
      const user = await findUser(A.email);
      assert.ok(user, "stored with a normalised email");
      assert.strictEqual(user!.role, "STUDENT");
      assert.strictEqual(user!.status, "PENDING_APPROVAL");
      assert.strictEqual(user!.signup!.registrationNumber, "TESTSU0001");
      assert.notStrictEqual(user!.passwordHash, PASSWORD, "password is hashed");
    });

    it("never creates duplicates and does not reveal existing emails", async (t) => {
      if (!isDbConnected()) return t.skip("demo data mode");
      assert.strictEqual((await signup(form(A))).status, 202);
      assert.strictEqual((await signup(form({ ...A, email: "TEST.SIGNUP.ASHA@lpu.in" }))).status, 202);
      assert.strictEqual(await userCount(A.email), 1);

      // Same registration number with another email is refused
      assert.strictEqual((await signup(form({ ...A, email: "test.signup.other@lpu.in" }))).status, 409);
      assert.strictEqual(await userCount("test.signup.other@lpu.in"), 0);
    });

    it("silently drops bot submissions (honeypot)", async (t) => {
      if (!isDbConnected()) return t.skip("demo data mode");
      const res = await signup(form({ name: "Bot Account", email: "test.signup.bot@lpu.in", registrationNumber: "TESTSU0099" }, { website: "http://spam.example" }));
      assert.strictEqual(res.status, 202);
      assert.strictEqual(await userCount("test.signup.bot@lpu.in"), 0);
    });

    it("only reveals a pending status after the correct password", async (t) => {
      if (!isDbConnected()) return t.skip("demo data mode");
      const wrong = await login(A.email, "WrongPass1");
      assert.strictEqual(wrong.status, 401);
      assert.strictEqual(wrong.json.code, undefined);
      const right = await login(A.email);
      assert.strictEqual(right.status, 403);
      assert.strictEqual(right.json.code, "ACCOUNT_PENDING");
    });
  });

  describe("Review", () => {
    it("is limited to Cell Coordinators and Administrators", async () => {
      assert.strictEqual((await call("GET", "/signup-requests")).status, 401);
      for (const as of ["studentA", "faculty", "dean", "analyst", "guild", "placement"] as const) {
        assert.strictEqual((await call("GET", "/signup-requests", { as })).status, 403, as);
        assert.strictEqual((await call("POST", "/signup-requests/usr-x/approve", { as })).status, 403, as);
      }
      assert.strictEqual((await call("GET", "/signup-requests", { as: "coordinator" })).status, 200);
      assert.strictEqual((await call("GET", "/signup-requests?status=PENDING_APPROVAL", { as: "admin" })).status, 200);
      assert.strictEqual((await call("GET", "/signup-requests?status=WHATEVER", { as: "admin" })).status, 400);
    });

    it("rejects with a reason the student can see, then allows re-applying", async (t) => {
      if (!isDbConnected()) return t.skip("demo data mode");
      const request = await requestFor(A.email, "coordinator");
      assert.strictEqual((await call("POST", `/signup-requests/${request.userId}/reject`, { as: "coordinator", body: {} })).status, 400);
      const rejected = await call("POST", `/signup-requests/${request.userId}/reject`, { as: "coordinator", body: { reason: "Registration number not found" } });
      assert.strictEqual(rejected.status, 200);
      assert.strictEqual(rejected.json.data.status, "REJECTED");
      assert.strictEqual(rejected.json.data.decidedBy, "CELL_COORDINATOR:usr-coordinator");

      const login403 = await login(A.email);
      assert.strictEqual(login403.json.code, "ACCOUNT_REJECTED");
      assert.match(login403.json.message, /Registration number not found/);

      assert.strictEqual((await signup(form(A))).status, 202);
      const again = await requestFor(A.email);
      assert.strictEqual(again.status, "PENDING_APPROVAL");
      assert.strictEqual(again.attempts, 2);
    });

    it("approves into a TIER_1 student who is blocked until the official CGPA is recorded", async (t) => {
      if (!isDbConnected()) return t.skip("demo data mode");
      const request = await requestFor(A.email);
      const approved = await call("POST", `/signup-requests/${request.userId}/approve`, { as: "admin" });
      assert.strictEqual(approved.status, 200);
      assert.strictEqual(approved.json.data.status, "ACTIVE");
      assert.strictEqual(approved.json.data.studentId, "stu-testsu0001");
      assert.strictEqual((await call("POST", `/signup-requests/${request.userId}/approve`, { as: "coordinator" })).status, 409, "no double approval");

      const student = await StudentModel.findOne({ id: "stu-testsu0001" }).lean<{ tier: string; registrationNumber: string; mentor: string }>();
      assert.strictEqual(student?.tier, "TIER_1");
      assert.strictEqual(student?.registrationNumber, "TESTSU0001");
      assert.strictEqual((await AcademicSnapshotModel.findOne({ studentId: "stu-testsu0001" }).lean<{ cgpaStatus: string }>())?.cgpaStatus, "RESTRICTED");

      const signedIn = await login(A.email);
      assert.strictEqual(signedIn.status, 200);
      assert.strictEqual(signedIn.json.user.role, "STUDENT");
      assert.strictEqual(signedIn.json.user.studentId, "stu-testsu0001");

      const safeguards = await call("GET", "/safeguards/stu-testsu0001", { as: "admin" });
      assert.strictEqual(safeguards.json.data.eligible, false, "cannot be allocated work before the official CGPA exists");
    });

    it("caps re-applications at 3", async (t) => {
      if (!isDbConnected()) return t.skip("demo data mode");
      for (let attempt = 1; attempt <= 3; attempt++) {
        assert.strictEqual((await signup(form(B))).status, 202);
        const request = await requestFor(B.email);
        assert.strictEqual(request.attempts, attempt);
        await call("POST", `/signup-requests/${request.userId}/reject`, { as: "admin", body: { reason: `Attempt ${attempt} rejected` } });
      }
      assert.strictEqual((await signup(form(B))).status, 202, "still a neutral answer");
      const final = await requestFor(B.email);
      assert.strictEqual(final.status, "REJECTED");
      assert.strictEqual(final.attempts, 3);
    });
  });

  describe("Switches and limits", () => {
    it("stops sign-ups when an administrator closes them", async (t) => {
      if (!isDbConnected()) return t.skip("demo data mode");
      assert.strictEqual((await call("PUT", "/settings", { as: "admin", body: { allowedSignupDomains: ["not a domain"] } })).status, 400);
      assert.strictEqual((await call("PUT", "/settings", { as: "admin", body: { signupEnabled: false } })).status, 200);
      assert.strictEqual((await call("GET", "/auth/signup-config")).json.data.enabled, false);
      assert.strictEqual((await signup(form({ name: "Late Comer", email: "test.signup.other@lpu.in", registrationNumber: "TESTSU0050" }))).status, 403);
      assert.strictEqual((await call("PUT", "/settings", { as: "admin", body: { signupEnabled: true } })).status, 200);
    });

    it("limits repeated sign-up attempts from one device", async () => {
      process.env.SIGNUP_RATE_LIMIT = "2";
      resetRateLimits();
      try {
        await signup({});
        await signup({});
        assert.strictEqual((await signup({})).status, 429);
      } finally {
        process.env.SIGNUP_RATE_LIMIT = "1000";
        resetRateLimits();
      }
    });

    it("locks sign-in briefly after repeated wrong passwords", async () => {
      process.env.LOGIN_FAILURE_LIMIT = "3";
      resetRateLimits();
      try {
        for (let i = 0; i < 3; i++) assert.strictEqual((await login("student@revalanche.local", "WrongPass9")).status, 401);
        assert.strictEqual((await login("student@revalanche.local", "Password123!")).status, 429);
      } finally {
        process.env.LOGIN_FAILURE_LIMIT = "1000";
        resetRateLimits();
      }
      assert.strictEqual((await login("student@revalanche.local", "Password123!")).status, 200);
    });
  });
});
