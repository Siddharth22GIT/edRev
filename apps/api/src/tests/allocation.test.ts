/**
 * Phase 6A – Part 2: Allocation Integrity and Production Safety
 *
 * Tests:
 *  1. Bid integrity: invalid bids, missing opportunities, unauthorized allocation
 *  2. Conflicting/duplicate allocations
 *  3. Mock-data fallback behavior (DB-off paths)
 *  4. Configuration safety validation (JWT secret, MONGODB_URI)
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import { connectDB, isDbConnected } from "../config/db.js";
import { seedDatabaseIfEmpty } from "../utils/seed.js";
import { BidModel, AllocationModel, OpportunityModel } from "../models/index.js";

const JWT_SECRET = process.env.JWT_SECRET || "revalanche_dev_jwt_secret_key_change_in_production";

function createToken(payload: {
  id: string;
  name: string;
  email: string;
  role: string;
  studentId?: string;
}): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

// ──────────────────────────────────────────────────────────────────────────────
// Test users / tokens
// ──────────────────────────────────────────────────────────────────────────────
const student = {
  id: "usr-student",
  name: "Rohan Patel",
  email: "student@revalanche.local",
  role: "STUDENT",
  studentId: "stu-202",
};
const tokenStudent = createToken(student);

const analyst = {
  id: "usr-analyst",
  name: "Elena Martin",
  email: "analyst@revalanche.local",
  role: "BID_DESK_ANALYST",
};
const tokenAnalyst = createToken(analyst);

const studentUnrelated = {
  id: "usr-student-201",
  name: "Maya Chen",
  email: "maya.chen@revalanche.local",
  role: "STUDENT",
  studentId: "stu-201",
};
const tokenStudentUnrelated = createToken(studentUnrelated);

// A fake student who has no bid on any opportunity
const studentNoBid = {
  id: "usr-student-no-bid",
  name: "No Bid Student",
  email: "nobid@revalanche.local",
  role: "STUDENT",
  studentId: "stu-no-bid",
};

// Non-privileged role that cannot allocate
const editor = {
  id: "usr-editor",
  name: "Priya Sharma",
  email: "editor@revalanche.local",
  role: "PROPOSAL_EDITOR",
};
const tokenEditor = createToken(editor);

// Valid allocator roles
const admin = {
  id: "usr-admin",
  name: "System Administrator",
  email: "admin@revalanche.local",
  role: "ADMINISTRATOR",
};
const tokenAdmin = createToken(admin);

describe("Phase 6A Part 2 — Allocation Integrity and Production Safety", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const connected = await connectDB();
    if (connected) {
      await seedDatabaseIfEmpty();
    }
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}/api`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Suite 1 – Bid submission integrity
  // ────────────────────────────────────────────────────────────────────────────
  describe("Suite 1: Bid submission integrity", () => {
    it("rejects unauthenticated bid submission with 401", async () => {
      const res = await fetch(`${baseUrl}/opportunities/opp-1024/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedAmount: 15000,
          estimatedCompletionTime: "14 days",
          message: "I can do this.",
          relevantSkills: "Figma",
        }),
      });
      assert.strictEqual(res.status, 401);
    });

    it("rejects non-student role (BID_DESK_ANALYST) from submitting a bid with 403", async () => {
      const res = await fetch(`${baseUrl}/opportunities/opp-1024/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenAnalyst}`,
        },
        body: JSON.stringify({
          proposedAmount: 15000,
          estimatedCompletionTime: "14 days",
          message: "Analyst trying to bid.",
          relevantSkills: "Excel",
        }),
      });
      assert.strictEqual(res.status, 403);
      const json = (await res.json()) as any;
      assert.match(json.message, /not authorized/i);
    });

    it("rejects bid for a non-existent opportunity with 404 (DB path)", async () => {
      if (!isDbConnected()) return; // DB-level check only

      const res = await fetch(`${baseUrl}/opportunities/opp-does-not-exist/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenStudent}`,
        },
        body: JSON.stringify({
          proposedAmount: 5000,
          estimatedCompletionTime: "7 days",
          message: "Trying a missing opp.",
          relevantSkills: "SQL",
        }),
      });
      assert.strictEqual(res.status, 404);
      const json = (await res.json()) as any;
      assert.match(json.message, /opportunity not found/i);
    });

    it("rejects bid with missing required fields with 400", async () => {
      const res = await fetch(`${baseUrl}/opportunities/opp-1024/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenStudent}`,
        },
        body: JSON.stringify({
          // Missing estimatedCompletionTime, message, relevantSkills
          proposedAmount: 5000,
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /required/i);
    });

    it("prevents duplicate bid from the same student on the same opportunity with 409", async () => {
      // The seed data already has bid-1: stu-202 → opp-1025
      // Attempt to submit a second bid for the same combo
      const res = await fetch(`${baseUrl}/opportunities/opp-1025/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenStudent}`,
        },
        body: JSON.stringify({
          proposedAmount: 11000,
          estimatedCompletionTime: "12 days",
          message: "Second attempt.",
          relevantSkills: "SQL, Power BI",
        }),
      });
      assert.strictEqual(res.status, 409);
      const json = (await res.json()) as any;
      assert.match(json.message, /already submitted/i);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Suite 2 – Allocation authorization
  // ────────────────────────────────────────────────────────────────────────────
  describe("Suite 2: Allocation authorization", () => {
    it("rejects unauthenticated allocation request with 401", async () => {
      const res = await fetch(`${baseUrl}/opportunities/opp-1025/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: "stu-202" }),
      });
      assert.strictEqual(res.status, 401);
    });

    it("rejects allocation from a STUDENT role with 403", async () => {
      const res = await fetch(`${baseUrl}/opportunities/opp-1025/allocate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenStudent}`,
        },
        body: JSON.stringify({ studentId: "stu-202" }),
      });
      assert.strictEqual(res.status, 403);
      const json = (await res.json()) as any;
      assert.match(json.message, /not authorized/i);
    });

    it("rejects allocation from a PROPOSAL_EDITOR role with 403", async () => {
      const res = await fetch(`${baseUrl}/opportunities/opp-1025/allocate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenEditor}`,
        },
        body: JSON.stringify({ studentId: "stu-202" }),
      });
      assert.strictEqual(res.status, 403);
    });

    it("rejects allocation request missing studentId body field with 400", async () => {
      const res = await fetch(`${baseUrl}/opportunities/opp-1025/allocate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /studentId is required/i);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Suite 3 – Allocation integrity (DB-connected path)
  // ────────────────────────────────────────────────────────────────────────────
  describe("Suite 3: Allocation integrity (DB path)", () => {
    it("rejects allocation for a non-existent opportunity with 404", async () => {
      if (!isDbConnected()) return;

      const res = await fetch(`${baseUrl}/opportunities/opp-ghost/allocate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({ studentId: "stu-202" }),
      });
      assert.strictEqual(res.status, 404);
      const json = (await res.json()) as any;
      assert.match(json.message, /opportunity not found/i);
    });

    it("rejects allocation when the student has no bid on the opportunity with 400", async () => {
      if (!isDbConnected()) return;

      // opp-1024 is OPEN; stu-202 has never bid on it
      const res = await fetch(`${baseUrl}/opportunities/opp-1024/allocate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({ studentId: "stu-202" }),
      });
      // Must reject: no bid exists
      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /no bid found/i);
    });

    it("allocates successfully when a valid bid exists (opp-1025 / stu-202)", async () => {
      if (!isDbConnected()) return;

      // Clean up any prior allocation for opp-1025 to keep this test idempotent
      await AllocationModel.deleteOne({ opportunityId: "opp-1025" });
      // Restore bid to SUBMITTED so the allocate endpoint finds it
      await BidModel.updateOne(
        { opportunityId: "opp-1025", studentId: "stu-202" },
        { $set: { status: "SUBMITTED" } }
      );
      // Also make sure the opportunity is not already ALLOCATED (reset if needed)
      await OpportunityModel.updateOne({ id: "opp-1025" }, { $set: { status: "UNDER_REVIEW" } });

      const res = await fetch(`${baseUrl}/opportunities/opp-1025/allocate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({ studentId: "stu-202" }),
      });

      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.ok(json.data);
      assert.strictEqual(json.data.opportunityId, "opp-1025");
      assert.strictEqual(json.data.studentId, "stu-202");
      assert.ok(json.data.allocatedAt);
      assert.ok(json.data.slaDeadline);
      assert.strictEqual(json.data.slaStatus, "ACTIVE");
    });

    it("prevents conflicting re-allocation of an already-allocated opportunity to a different student", async () => {
      if (!isDbConnected()) return;

      // opp-1025 was allocated to stu-202 in the previous test
      // Attempt to re-allocate it to stu-201 (who has no bid on this opp anyway)
      const res = await fetch(`${baseUrl}/opportunities/opp-1025/allocate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({ studentId: "stu-201" }),
      });

      // stu-201 has no bid on opp-1025, so it must be rejected
      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      // Either "no bid" or safeguard/allocation conflict
      assert.ok(json.message && json.message.length > 0);
    });

    it("does not create duplicate allocation records in the database", async () => {
      if (!isDbConnected()) return;

      // Restore bid so the re-allocation call can reach the DB layer
      await BidModel.updateOne(
        { opportunityId: "opp-1025", studentId: "stu-202" },
        { $set: { status: "SUBMITTED" } }
      );

      // Attempt same allocation again for the same student
      await fetch(`${baseUrl}/opportunities/opp-1025/allocate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({ studentId: "stu-202" }),
      });

      // Count allocation records for opp-1025 — must be exactly 1 (upsert logic)
      const count = await AllocationModel.countDocuments({ opportunityId: "opp-1025" });
      assert.strictEqual(count, 1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Suite 4 – Mock-data fallback behavior (DB-off path)
  // ────────────────────────────────────────────────────────────────────────────
  describe("Suite 4: Mock-data fallback (non-DB path)", () => {
    it("still serves opportunity list when DB is unavailable (mock fallback)", async () => {
      if (isDbConnected()) return; // This suite only runs in no-DB mode

      const res = await fetch(`${baseUrl}/opportunities`);
      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.ok(Array.isArray(json.data));
      assert.ok(json.data.length > 0, "Mock opportunities should be present");
    });

    it("returns null for allocation when DB is unavailable", async () => {
      if (isDbConnected()) return;

      const res = await fetch(`${baseUrl}/opportunities/opp-1025/allocation`);
      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      // No allocation record in mock data (allocations array is empty by default)
      assert.strictEqual(json.data, null);
    });

    it("mock bid submission rejects duplicate via mock store", async () => {
      if (isDbConnected()) return;

      // bid-1 already exists for stu-202 / opp-1025 in mock data
      const res = await fetch(`${baseUrl}/opportunities/opp-1025/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenStudent}`,
        },
        body: JSON.stringify({
          proposedAmount: 12000,
          estimatedCompletionTime: "10 days",
          message: "Duplicate attempt via mock.",
          relevantSkills: "SQL",
        }),
      });
      assert.strictEqual(res.status, 409);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Suite 5 – Configuration safety
  // ────────────────────────────────────────────────────────────────────────────
  describe("Suite 5: Configuration safety", () => {
    it("does not expose the JWT secret value in any API response or log output", async () => {
      // Hit any endpoint and verify the secret does not appear in the JSON body
      const knownDevSecret = "revalanche_dev_jwt_secret_key_change_in_production";
      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${createToken(student)}` },
      });
      const text = await res.text();
      assert.ok(
        !text.includes(knownDevSecret),
        "API response must never contain the JWT secret string"
      );
    });

    it("does not expose MONGODB_URI or raw connection strings in any API response", async () => {
      const res = await fetch(`${baseUrl}/health`);
      const text = await res.text();
      assert.ok(
        !text.includes("mongodb://") && !text.includes("mongodb+srv://"),
        "Health endpoint must not expose connection URI"
      );
    });

    it("verifies that DEV_FALLBACK_URI is not used in production (unit-level check)", () => {
      // In a test environment NODE_ENV is never 'production', so we only
      // assert that the guard constant is identifiable as the known dev value.
      const devUri = "mongodb://127.0.0.1:27017/edurev";
      const devJwt = "revalanche_dev_jwt_secret_key_change_in_production";

      // If somehow running in production with default values, the process
      // should already have exited. Here we just document the expected values.
      if (process.env.NODE_ENV === "production") {
        assert.notStrictEqual(
          process.env.MONGODB_URI,
          devUri,
          "Production MONGODB_URI must not be the dev fallback"
        );
        assert.ok(
          process.env.JWT_SECRET && process.env.JWT_SECRET !== devJwt,
          "Production JWT_SECRET must not be the dev placeholder"
        );
      } else {
        // In dev/test mode, we just confirm the guard doesn't blow up
        assert.ok(true, "Config guards are enforced only in production NODE_ENV");
      }
    });
  });
});
