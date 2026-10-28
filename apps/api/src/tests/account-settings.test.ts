import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import bcrypt from "bcryptjs";
import type { SettingsSummary } from "@edurev/types";
import { settings as mockSettings } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { SettingsModel, UserModel } from "../models/index.js";
import { createToken, makeClient, startTestServer, stopTestServer, type TestUser } from "./helpers.js";

// A throwaway account so password/preference tests never touch the real development logins
const TEMP_USER: TestUser = { id: "usr-test-account-settings", name: "Settings Tester", email: "settings.tester@revalanche.local", role: "STUDENT" };
const TEMP_PASSWORD = "Password123!";
// In demo data mode only the built-in seed users exist, so preferences are exercised on one of them (in memory only)
const MOCK_USER: TestUser = { id: "usr-analyst", name: "Elena Martin", email: "analyst@revalanche.local", role: "BID_DESK_ANALYST" };

describe("Account & Institutional Settings Suite", () => {
  let server: Server;
  let baseUrl = "";
  const call = makeClient(() => baseUrl);
  let settingsSnapshot: SettingsSummary | null = null;
  let selfToken = "";

  const raw = async (method: string, path: string, token?: string, body?: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };

  before(async () => {
    ({ server, baseUrl } = await startTestServer());
    if (isDbConnected()) {
      await UserModel.deleteOne({ id: TEMP_USER.id });
      await UserModel.create({ ...TEMP_USER, passwordHash: await bcrypt.hash(TEMP_PASSWORD, 10) });
      const stored = await SettingsModel.findOne({ id: "default" }).lean<SettingsSummary>();
      settingsSnapshot = stored ? { organizationName: stored.organizationName, notificationEmail: stored.notificationEmail, timezone: stored.timezone, weeklyDigestEnabled: stored.weeklyDigestEnabled } : null;
      selfToken = createToken(TEMP_USER);
    } else {
      settingsSnapshot = { ...mockSettings };
      selfToken = createToken(MOCK_USER);
    }
  });

  after(async () => {
    if (isDbConnected()) {
      await UserModel.deleteOne({ id: TEMP_USER.id });
      if (settingsSnapshot) await SettingsModel.updateOne({ id: "default" }, { $set: settingsSnapshot });
    } else if (settingsSnapshot) {
      Object.assign(mockSettings, settingsSnapshot);
    }
    await stopTestServer(server);
  });

  describe("Institutional settings", () => {
    it("can be read by any signed-in role", async () => {
      assert.strictEqual((await call("GET", "/settings")).status, 401);
      assert.strictEqual((await call("GET", "/settings", { as: "studentA" })).status, 200);
    });

    it("can only be changed by an administrator", async () => {
      const body = { organizationName: "Hacked Org" };
      assert.strictEqual((await call("PUT", "/settings", { body })).status, 401);
      for (const as of ["studentA", "faculty", "dean", "coordinator"] as const) {
        assert.strictEqual((await call("PUT", "/settings", { as, body })).status, 403, as);
      }
    });

    it("validates and saves an administrator's changes", async () => {
      assert.strictEqual((await call("PUT", "/settings", { as: "admin", body: {} })).status, 400);
      assert.strictEqual((await call("PUT", "/settings", { as: "admin", body: { notificationEmail: "not-an-email" } })).status, 400);
      assert.strictEqual((await call("PUT", "/settings", { as: "admin", body: { timezone: "Mars/Olympus" } })).status, 400);
      assert.strictEqual((await call("PUT", "/settings", { as: "admin", body: { weeklyDigestEnabled: "yes" } })).status, 400);

      const saved = await call("PUT", "/settings", {
        as: "admin",
        body: { organizationName: "  EduRev Test Campus  ", notificationEmail: "ops@test.example", timezone: "Europe/London", weeklyDigestEnabled: false },
      });
      assert.strictEqual(saved.status, 200);
      assert.strictEqual(saved.json.data.organizationName, "EduRev Test Campus");

      const read = await call("GET", "/settings", { as: "studentA" });
      assert.strictEqual(read.json.data.timezone, "Europe/London");
      assert.strictEqual(read.json.data.weeklyDigestEnabled, false);
    });
  });

  describe("Programme analytics", () => {
    it("is staff-only", async () => {
      for (const path of ["/analytics", "/dashboard"]) {
        assert.strictEqual((await call("GET", path)).status, 401, path);
        assert.strictEqual((await call("GET", path, { as: "studentA" })).status, 403, path);
        assert.strictEqual((await call("GET", path, { as: "analyst" })).status, 200, path);
        assert.strictEqual((await call("GET", path, { as: "placement" })).status, 200, path);
      }
    });
  });

  describe("Change password", () => {
    it("requires authentication and validates the new password", async () => {
      assert.strictEqual((await raw("POST", "/auth/password", undefined, { currentPassword: TEMP_PASSWORD, newPassword: "NewPass456" })).status, 401);
      assert.strictEqual((await raw("POST", "/auth/password", selfToken, { currentPassword: TEMP_PASSWORD })).status, 400);
      assert.strictEqual((await raw("POST", "/auth/password", selfToken, { currentPassword: TEMP_PASSWORD, newPassword: "short1" })).status, 400);
      assert.strictEqual((await raw("POST", "/auth/password", selfToken, { currentPassword: TEMP_PASSWORD, newPassword: "onlyletters" })).status, 400);
      assert.strictEqual((await raw("POST", "/auth/password", selfToken, { currentPassword: TEMP_PASSWORD, newPassword: TEMP_PASSWORD })).status, 400);
    });

    it("changes the password only with the correct current password", async () => {
      const res = await raw("POST", "/auth/password", selfToken, { currentPassword: "WrongPass999", newPassword: "NewPass456" });
      if (!isDbConnected()) {
        assert.strictEqual(res.status, 503, "not available in demo data mode");
        return;
      }
      assert.strictEqual(res.status, 400);

      assert.strictEqual((await raw("POST", "/auth/password", selfToken, { currentPassword: TEMP_PASSWORD, newPassword: "NewPass456" })).status, 200);
      assert.strictEqual((await raw("POST", "/auth/login", undefined, { email: TEMP_USER.email, password: TEMP_PASSWORD })).status, 401);
      assert.strictEqual((await raw("POST", "/auth/login", undefined, { email: TEMP_USER.email, password: "NewPass456" })).status, 200);
    });
  });

  describe("Preferences", () => {
    it("requires authentication and accepts only known true/false values", async () => {
      assert.strictEqual((await raw("PATCH", "/auth/me/preferences", undefined, { celebrations: false })).status, 401);
      assert.strictEqual((await raw("PATCH", "/auth/me/preferences", selfToken, {})).status, 400);
      assert.strictEqual((await raw("PATCH", "/auth/me/preferences", selfToken, { celebrations: "off" })).status, 400);
      assert.strictEqual((await raw("PATCH", "/auth/me/preferences", selfToken, { role: "ADMINISTRATOR" })).status, 400);
    });

    it("saves the signed-in user's preferences and returns them on /auth/me", async () => {
      const saved = await raw("PATCH", "/auth/me/preferences", selfToken, { celebrations: false, reduceMotion: true });
      assert.strictEqual(saved.status, 200);
      assert.deepStrictEqual(saved.json.data, { celebrations: false, reduceMotion: true, showBadges: true });

      const me = await raw("GET", "/auth/me", selfToken);
      assert.strictEqual(me.status, 200);
      assert.strictEqual(me.json.user.preferences.celebrations, false);
      assert.strictEqual(me.json.user.preferences.showBadges, true);

      if (!isDbConnected()) {
        // Put the in-memory seed user back to defaults
        await raw("PATCH", "/auth/me/preferences", selfToken, { celebrations: true, reduceMotion: false, showBadges: true });
      }
    });
  });
});
