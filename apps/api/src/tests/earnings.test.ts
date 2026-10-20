import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import { connectDB, isDbConnected } from "../config/db.js";
import { seedDatabaseIfEmpty } from "../utils/seed.js";
import { EarningsEntryModel, StudentModel } from "../models/index.js";

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

describe("Earnings Security & Integrity Suite", () => {
  let server: Server;
  let baseUrl: string;

  const studentA = {
    id: "usr-student-202",
    name: "Rohan Patel",
    email: "rohan.patel@revalanche.local",
    role: "STUDENT",
    studentId: "stu-202",
  };
  const tokenStudentA = createToken(studentA);

  const studentB = {
    id: "usr-student-201",
    name: "Maya Chen",
    email: "maya.chen@revalanche.local",
    role: "STUDENT",
    studentId: "stu-201",
  };
  const tokenStudentB = createToken(studentB);

  const analyst = {
    id: "usr-analyst",
    name: "Elena Analyst",
    email: "analyst@revalanche.local",
    role: "BID_DESK_ANALYST",
  };
  const tokenAnalyst = createToken(analyst);

  const editor = {
    id: "usr-editor",
    name: "Priya Editor",
    email: "editor@revalanche.local",
    role: "PROPOSAL_EDITOR",
  };
  const tokenEditor = createToken(editor);

  const faculty = {
    id: "usr-faculty",
    name: "Prof. Elena Martin",
    email: "faculty@revalanche.local",
    role: "FACULTY_DIRECTOR",
  };
  const tokenFaculty = createToken(faculty);

  const admin = {
    id: "usr-admin",
    name: "System Administrator",
    email: "admin@revalanche.local",
    role: "ADMINISTRATOR",
  };
  const tokenAdmin = createToken(admin);

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

  describe("Task 1: Authentication & RBAC on All Earnings Endpoints", () => {
    it("rejects unauthenticated GET /api/earnings with 401", async () => {
      const res = await fetch(`${baseUrl}/earnings`);
      assert.strictEqual(res.status, 401);
      const json = (await res.json()) as any;
      assert.match(json.message, /authentication required/i);
    });

    it("rejects unauthenticated GET /api/earnings/summary with 401", async () => {
      const res = await fetch(`${baseUrl}/earnings/summary`);
      assert.strictEqual(res.status, 401);
      const json = (await res.json()) as any;
      assert.match(json.message, /authentication required/i);
    });

    it("rejects unauthenticated POST /api/earnings with 401", async () => {
      const res = await fetch(`${baseUrl}/earnings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformName: "Upwork", originalAmount: 100 }),
      });
      assert.strictEqual(res.status, 401);
    });

    it("rejects unauthenticated PATCH /api/earnings/:id/verify with 401", async () => {
      const res = await fetch(`${baseUrl}/earnings/earn-1/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "VERIFIED" }),
      });
      assert.strictEqual(res.status, 401);
    });

    it("rejects unauthenticated GET /api/platform-accounts with 401", async () => {
      const res = await fetch(`${baseUrl}/platform-accounts`);
      assert.strictEqual(res.status, 401);
    });

    it("rejects unauthorized non-institutional roles (BID_DESK_ANALYST) from GET /api/earnings with 403", async () => {
      const res = await fetch(`${baseUrl}/earnings`, {
        headers: { Authorization: `Bearer ${tokenAnalyst}` },
      });
      assert.strictEqual(res.status, 403);
      const json = (await res.json()) as any;
      assert.match(json.message, /not authorized/i);
    });

    it("rejects unauthorized non-institutional roles (PROPOSAL_EDITOR) from GET /api/earnings/summary with 403", async () => {
      const res = await fetch(`${baseUrl}/earnings/summary`, {
        headers: { Authorization: `Bearer ${tokenEditor}` },
      });
      assert.strictEqual(res.status, 403);
    });

    it("allows authorized institutional roles (FACULTY_DIRECTOR) to GET /api/earnings", async () => {
      const res = await fetch(`${baseUrl}/earnings`, {
        headers: { Authorization: `Bearer ${tokenFaculty}` },
      });
      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.ok(Array.isArray(json.data));
    });
  });

  describe("Task 2: Student Read Scoping & Cross-Student Isolation", () => {
    it("restricts student to only their own earnings on GET /api/earnings", async () => {
      const res = await fetch(`${baseUrl}/earnings`, {
        headers: { Authorization: `Bearer ${tokenStudentA}` },
      });
      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.ok(Array.isArray(json.data));
      // All returned records must belong to studentA (stu-202)
      for (const item of json.data) {
        assert.strictEqual(item.studentId, studentA.studentId);
      }
    });

    it("rejects cross-student query parameter on GET /api/earnings?studentId=stu-201 with 403", async () => {
      const res = await fetch(`${baseUrl}/earnings?studentId=${studentB.studentId}`, {
        headers: { Authorization: `Bearer ${tokenStudentA}` },
      });
      assert.strictEqual(res.status, 403);
      const json = (await res.json()) as any;
      assert.match(json.message, /only view their own earnings/i);
    });

    it("rejects cross-student query parameter on GET /api/earnings/summary?studentId=stu-201 with 403", async () => {
      const res = await fetch(`${baseUrl}/earnings/summary?studentId=${studentB.studentId}`, {
        headers: { Authorization: `Bearer ${tokenStudentA}` },
      });
      assert.strictEqual(res.status, 403);
      const json = (await res.json()) as any;
      assert.match(json.message, /only view their own earnings summary/i);
    });

    it("rejects cross-student query parameter on GET /api/platform-accounts?studentId=stu-201 with 403", async () => {
      const res = await fetch(`${baseUrl}/platform-accounts?studentId=${studentB.studentId}`, {
        headers: { Authorization: `Bearer ${tokenStudentA}` },
      });
      assert.strictEqual(res.status, 403);
      const json = (await res.json()) as any;
      assert.match(json.message, /only view their own platform accounts/i);
    });
  });

  describe("Task 3: Deriving Student Identity from Authenticated User on Submission", () => {
    it("ignores client-supplied studentId in request body and derives identity strictly from authenticated user", async () => {
      const fakeStudentId = "stu-victim-999";
      const res = await fetch(`${baseUrl}/earnings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          studentId: fakeStudentId, // Spoofed body param
          platformName: "Fiverr Freelance",
          originalAmount: 150,
          originalCurrency: "USD",
          exchangeRate: 83.2,
          evidence: "Receipt #1004",
        }),
      });

      assert.strictEqual(res.status, 201);
      const json = (await res.json()) as any;
      assert.ok(json.data);
      // Identity MUST be derived from token (stu-202), NOT fakeStudentId
      assert.strictEqual(json.data.studentId, studentA.studentId);
      assert.notStrictEqual(json.data.studentId, fakeStudentId);
    });

    it("rejects submission with invalid or non-positive originalAmount", async () => {
      const res = await fetch(`${baseUrl}/earnings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          platformName: "Fiverr Freelance",
          originalAmount: -50,
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /positive number/i);
    });

    it("blocks non-student roles from submitting earnings with 403", async () => {
      const res = await fetch(`${baseUrl}/earnings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenFaculty}`,
        },
        body: JSON.stringify({
          platformName: "Direct Client",
          originalAmount: 200,
        }),
      });
      assert.strictEqual(res.status, 403);
    });
  });

  describe("Task 4 & 6: Verification & Rejection Permissions, Persisting Details", () => {
    let pendingEarningId: string;

    before(async () => {
      // Submit a pending earning as student A
      const res = await fetch(`${baseUrl}/earnings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          platformName: "Toptal",
          originalAmount: 250,
          originalCurrency: "USD",
          exchangeRate: 80,
          evidence: "Timesheet screenshot",
        }),
      });
      const json = (await res.json()) as any;
      pendingEarningId = json.data.id;
    });

    it("blocks students from verifying earnings with 403", async () => {
      const res = await fetch(`${baseUrl}/earnings/${pendingEarningId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ status: "VERIFIED" }),
      });
      assert.strictEqual(res.status, 403);
    });

    it("blocks bid desk analyst from verifying earnings with 403", async () => {
      const res = await fetch(`${baseUrl}/earnings/${pendingEarningId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenAnalyst}`,
        },
        body: JSON.stringify({ status: "VERIFIED" }),
      });
      assert.strictEqual(res.status, 403);
    });

    it("requires rejectionReason when rejecting an earning", async () => {
      const res = await fetch(`${baseUrl}/earnings/${pendingEarningId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenFaculty}`,
        },
        body: JSON.stringify({ status: "REJECTED" }), // Missing rejectionReason
      });
      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /rejectionReason is required/i);
    });

    it("allows authorized role (FACULTY_DIRECTOR) to reject earning with reason and persists verifier & timestamp", async () => {
      const res = await fetch(`${baseUrl}/earnings/${pendingEarningId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenFaculty}`,
        },
        body: JSON.stringify({
          status: "REJECTED",
          rejectionReason: "Invoice does not list client tax ID",
        }),
      });
      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.strictEqual(json.data.verificationStatus, "REJECTED");
      assert.strictEqual(json.data.rejectionReason, "Invoice does not list client tax ID");
      assert.strictEqual(json.data.verifiedBy, faculty.name);
      assert.ok(json.data.verifiedAt);
    });

    it("prevents repeated rejection attempts on an already rejected earning", async () => {
      const res = await fetch(`${baseUrl}/earnings/${pendingEarningId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({
          status: "REJECTED",
          rejectionReason: "Another rejection attempt",
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /already been rejected/i);
    });
  });

  describe("Task 5: Preventing Repeated Verification & Double Counting", () => {
    let freshEarningId: string;
    let convertedAmount: number;

    before(async () => {
      // Submit a fresh earning for student A
      const res = await fetch(`${baseUrl}/earnings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          platformName: "Upwork Global",
          originalAmount: 100,
          originalCurrency: "USD",
          exchangeRate: 83.2,
          evidence: "Upwork milestone proof",
        }),
      });
      const json = (await res.json()) as any;
      freshEarningId = json.data.id;
      convertedAmount = json.data.convertedAmount; // 8320
    });

    it("verifies earning successfully and records verifier, timestamp and updates student earnings", async () => {
      const res = await fetch(`${baseUrl}/earnings/${freshEarningId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenFaculty}`,
        },
        body: JSON.stringify({ status: "VERIFIED" }),
      });

      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.strictEqual(json.data.verificationStatus, "VERIFIED");
      assert.strictEqual(json.data.verifiedBy, faculty.name);
      assert.ok(json.data.verifiedAt);

      if (isDbConnected()) {
        const student = await StudentModel.findOne({ id: studentA.studentId }).lean();
        assert.ok(student);
        assert.ok((student.earnings || 0) >= convertedAmount);
      }
    });

    it("strictly rejects repeated verification and prevents double-counting", async () => {
      let initialStudentEarnings = 0;
      if (isDbConnected()) {
        const studentBefore = await StudentModel.findOne({ id: studentA.studentId }).lean();
        initialStudentEarnings = studentBefore?.earnings || 0;
      }

      // Second verification attempt for the exact same earning
      const res = await fetch(`${baseUrl}/earnings/${freshEarningId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({ status: "VERIFIED" }),
      });

      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /already been verified/i);

      if (isDbConnected()) {
        const studentAfter = await StudentModel.findOne({ id: studentA.studentId }).lean();
        // Earnings must NOT have increased!
        assert.strictEqual(studentAfter?.earnings, initialStudentEarnings);
      }
    });
  });

  describe("Task 7: Earnings Summary Calculations & Cross-Student Protection", () => {
    it("returns correct summary scoped exclusively to the authenticated student", async () => {
      const res = await fetch(`${baseUrl}/earnings/summary`, {
        headers: { Authorization: `Bearer ${tokenStudentA}` },
      });
      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.ok(json.data);
      assert.strictEqual(json.data.studentId, studentA.studentId);
      assert.strictEqual(typeof json.data.totalSubmitted, "number");
      assert.strictEqual(typeof json.data.totalVerified, "number");
      assert.strictEqual(typeof json.data.totalPending, "number");
      assert.strictEqual(typeof json.data.totalRejected, "number");
      assert.strictEqual(json.data.currency, "INR");
      // Verify totalSubmitted = verified + pending + rejected
      const sumComponents = Number(
        (json.data.totalVerified + json.data.totalPending + json.data.totalRejected).toFixed(2)
      );
      assert.strictEqual(json.data.totalSubmitted, sumComponents);
      assert.strictEqual(
        json.data.count,
        json.data.verifiedCount + json.data.pendingCount + json.data.rejectedCount
      );
    });

    it("allows authorized institutional roles to get aggregate summary across all students", async () => {
      const res = await fetch(`${baseUrl}/earnings/summary`, {
        headers: { Authorization: `Bearer ${tokenFaculty}` },
      });
      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.ok(json.data);
      assert.strictEqual(json.data.studentId, undefined);
      assert.ok(json.data.count >= 1);
    });

    it("allows authorized institutional roles to filter summary by studentId", async () => {
      const res = await fetch(`${baseUrl}/earnings/summary?studentId=${studentA.studentId}`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.ok(json.data);
      assert.strictEqual(json.data.studentId, studentA.studentId);
    });
  });
});
