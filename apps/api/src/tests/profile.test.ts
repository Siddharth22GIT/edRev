import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import type { Student } from "@edurev/types";
import { students as mockStudents } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { StudentModel } from "../models/index.js";
import { makeClient, startTestServer, stopTestServer } from "./helpers.js";

const STUDENT_ID = "stu-202"; // studentA in the test helpers
// Only the fields this suite edits are restored (other suites change e.g. earnings in parallel)
const PROFILE_FIELDS = ["bio", "phone", "location", "skills", "photoUrl"] as const;

// 1×1 PNG and a JPEG header, for photo validation
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString("base64");

describe("Student Profile & Photo Suite", () => {
  let server: Server;
  let baseUrl = "";
  const call = makeClient(() => baseUrl);
  let snapshot: Partial<Student> = {};

  before(async () => {
    ({ server, baseUrl } = await startTestServer());
    const original = isDbConnected()
      ? await StudentModel.findOne({ id: STUDENT_ID }).lean<Student>()
      : mockStudents.find((s) => s.id === STUDENT_ID);
    for (const key of PROFILE_FIELDS) (snapshot as any)[key] = (original as any)?.[key];
  });

  after(async () => {
    // Put the student's profile back exactly as it was
    const set: Record<string, unknown> = {};
    const unset: Record<string, ""> = {};
    for (const key of PROFILE_FIELDS) {
      if ((snapshot as any)[key] === undefined) unset[key] = "";
      else set[key] = (snapshot as any)[key];
    }
    if (isDbConnected()) {
      await StudentModel.updateOne({ id: STUDENT_ID }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
    } else {
      const student = mockStudents.find((s) => s.id === STUDENT_ID) as any;
      Object.assign(student, set);
      for (const key of Object.keys(unset)) delete student[key];
    }
    await stopTestServer(server);
  });

  describe("Access", () => {
    it("requires authentication", async () => {
      assert.strictEqual((await call("PATCH", `/students/${STUDENT_ID}/profile`, { body: { bio: "x" } })).status, 401);
      assert.strictEqual((await call("PUT", `/students/${STUDENT_ID}/photo`, { body: { photoDataUrl: "x" } })).status, 401);
      assert.strictEqual((await call("DELETE", `/students/${STUDENT_ID}/photo`)).status, 401);
    });

    it("blocks other students and non-admin staff", async () => {
      for (const as of ["studentB", "faculty", "guild"] as const) {
        assert.strictEqual((await call("PATCH", `/students/${STUDENT_ID}/profile`, { as, body: { bio: "x" } })).status, 403, as);
        assert.strictEqual((await call("PUT", `/students/${STUDENT_ID}/photo`, { as, body: { photoDataUrl: `data:image/png;base64,${TINY_PNG}` } })).status, 403, as);
        assert.strictEqual((await call("DELETE", `/students/${STUDENT_ID}/photo`, { as })).status, 403, as);
      }
    });

    it("lets an administrator edit a student's profile", async () => {
      const res = await call("PATCH", `/students/${STUDENT_ID}/profile`, { as: "admin", body: { location: "Admin-set location" } });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.data.location, "Admin-set location");
    });
  });

  describe("Profile details", () => {
    it("updates bio, phone, location and skills for the student themself", async () => {
      const res = await call("PATCH", `/students/${STUDENT_ID}/profile`, {
        as: "studentA",
        body: { bio: "  Data storyteller  ", phone: "+91 98765 43210", location: "Faridabad", skills: ["SQL", " Power BI ", "SQL", ""] },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.data.bio, "Data storyteller");
      assert.strictEqual(res.json.data.phone, "+91 98765 43210");
      assert.deepStrictEqual(res.json.data.skills, ["SQL", "Power BI"]);
    });

    it("ignores protected fields such as tier, CGPA and earnings", async () => {
      const before = (await call("GET", `/students/${STUDENT_ID}`, { as: "studentA" })).json.data;
      const res = await call("PATCH", `/students/${STUDENT_ID}/profile`, {
        as: "studentA",
        body: { bio: "Trying to promote myself", tier: "TIER_4", cgpa: 10, earnings: 999999, name: "Someone Else" },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.data.tier, before.tier);
      assert.strictEqual(res.json.data.cgpa, before.cgpa);
      assert.notStrictEqual(res.json.data.earnings, 999999);
      assert.notStrictEqual(res.json.data.name, "Someone Else");
    });

    it("rejects invalid input", async () => {
      const path = `/students/${STUDENT_ID}/profile`;
      assert.strictEqual((await call("PATCH", path, { as: "studentA", body: {} })).status, 400);
      assert.strictEqual((await call("PATCH", path, { as: "studentA", body: { tier: "TIER_4" } })).status, 400);
      assert.strictEqual((await call("PATCH", path, { as: "studentA", body: { bio: "x".repeat(501) } })).status, 400);
      assert.strictEqual((await call("PATCH", path, { as: "studentA", body: { phone: "call me maybe" } })).status, 400);
      assert.strictEqual((await call("PATCH", path, { as: "studentA", body: { skills: "SQL" } })).status, 400);
      assert.strictEqual((await call("PATCH", path, { as: "studentA", body: { skills: Array.from({ length: 21 }, (_, i) => `skill-${i}`) } })).status, 400);
    });
  });

  describe("Photo", () => {
    const path = `/students/${STUDENT_ID}/photo`;

    it("rejects unsupported, mislabelled and oversized images", async () => {
      assert.strictEqual((await call("PUT", path, { as: "studentA", body: { photoDataUrl: `data:image/gif;base64,${TINY_PNG}` } })).status, 400);
      assert.strictEqual((await call("PUT", path, { as: "studentA", body: { photoDataUrl: "https://example.com/me.png" } })).status, 400);
      // Declared PNG but the bytes are a JPEG
      assert.strictEqual((await call("PUT", path, { as: "studentA", body: { photoDataUrl: `data:image/png;base64,${JPEG_BYTES}` } })).status, 400);
      const big = Buffer.concat([Buffer.from(TINY_PNG, "base64"), Buffer.alloc(520 * 1024)]).toString("base64");
      assert.strictEqual((await call("PUT", path, { as: "studentA", body: { photoDataUrl: `data:image/png;base64,${big}` } })).status, 400);
    });

    it("saves a valid photo, shows it on the profile, and removes it", async () => {
      const photoDataUrl = `data:image/png;base64,${TINY_PNG}`;
      const saved = await call("PUT", path, { as: "studentA", body: { photoDataUrl } });
      assert.strictEqual(saved.status, 200);
      assert.strictEqual(saved.json.data.photoUrl, photoDataUrl);

      const profile = await call("GET", `/students/${STUDENT_ID}`, { as: "studentA" });
      assert.strictEqual(profile.json.data.photoUrl, photoDataUrl);

      const removed = await call("DELETE", path, { as: "studentA" });
      assert.strictEqual(removed.status, 200);
      assert.strictEqual(removed.json.data.photoUrl, undefined);
    });
  });
});
