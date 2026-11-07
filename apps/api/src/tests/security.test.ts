import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import type { Bid } from "@edurev/types";
import { bids as mockBids } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { DEV_JWT_SECRET, isAllowedWebOrigin, productionConfigProblems } from "../config/runtime.js";
import { sanitizeErrorMessage } from "../middleware/security.middleware.js";
import { BidModel, UserModel } from "../models/index.js";
import { proposalPdfProblem, screenshotProblem } from "../utils/uploads.js";
import { resetRateLimits } from "../utils/rate-limit.js";
import { createToken, makeClient, startTestServer, stopTestServer, testUsers } from "./helpers.js";

// Phase 1 security checks (docs/modules/security.md). Test names start with the item's ID.

const SEC_OPP_ID = "opp-security-test";
const b64 = (text: string) => Buffer.from(text).toString("base64");
const REAL_PDF = `data:application/pdf;base64,${b64("%PDF-1.4 security test")}`;
const HTML_AS_PDF = `data:application/pdf;base64,${b64("<html><script>alert(1)</script></html>")}`;
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const bid = (id: string, studentId: string, proposalPdfUrl: string, proposalPdfName: string): Bid => ({
  id,
  opportunityId: SEC_OPP_ID,
  studentId,
  proposedAmount: 1000,
  estimatedCompletionTime: "3 days",
  message: "Security test bid",
  relevantSkills: "Testing",
  proposalPdfUrl,
  proposalPdfName,
  status: "SUBMITTED",
  createdAt: new Date().toISOString(),
});
// An older record holding HTML under a PDF label (what S3 now blocks at upload) and a real PDF
const LEGACY_HTML_BID = bid("bid-sec-html", testUsers.studentA.studentId, `data:text/html;base64,${b64("<script>alert(1)</script>")}`, "evil.html");
const PDF_BID = bid("bid-sec-pdf", testUsers.studentB.studentId, REAL_PDF, "plan\r\nX-Injected: yes.pdf");

const PENDING_USER = { id: "usr-test-security-pending", name: "Pending Tester", email: "security.pending@revalanche.local", role: "STUDENT" as const };

describe("Security Suite (Phase 1)", () => {
  let server: Server;
  let baseUrl = "";
  const call = makeClient(() => baseUrl);

  before(async () => {
    ({ server, baseUrl } = await startTestServer());
    if (isDbConnected()) {
      await BidModel.deleteMany({ opportunityId: SEC_OPP_ID });
      await BidModel.create([LEGACY_HTML_BID, PDF_BID]);
      await UserModel.deleteOne({ id: PENDING_USER.id });
      await UserModel.create({ ...PENDING_USER, passwordHash: "x", status: "PENDING_APPROVAL" });
    } else {
      mockBids.push({ ...LEGACY_HTML_BID }, { ...PDF_BID });
    }
  });

  after(async () => {
    if (isDbConnected()) {
      await BidModel.deleteMany({ opportunityId: SEC_OPP_ID });
      await UserModel.deleteOne({ id: PENDING_USER.id });
    } else {
      for (const id of [LEGACY_HTML_BID.id, PDF_BID.id]) {
        const i = mockBids.findIndex((b) => b.id === id);
        if (i >= 0) mockBids.splice(i, 1);
      }
    }
    await stopTestServer(server);
  });

  describe("S1 demo data mode", () => {
    it("S1: without a database, production returns 503 instead of serving demo data", async (t) => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        assert.strictEqual((await call("GET", "/health")).status, 200, "health stays public");
        const res = await call("POST", "/auth/login", { body: { email: "admin@revalanche.local", password: "Password123!" } });
        if (isDbConnected()) {
          assert.notStrictEqual(res.status, 503, "with a database connected, production works normally");
          t.diagnostic("database connected: 503 path is covered by test:mock");
        } else {
          assert.strictEqual(res.status, 503, "no login with the shared dev password");
        }
      } finally {
        process.env.NODE_ENV = previous;
      }
    });
  });

  describe("S2 production config", () => {
    it("S2: production needs a real JWT secret of 32+ characters", () => {
      assert.deepStrictEqual(productionConfigProblems({ NODE_ENV: "development" }), []);
      assert.strictEqual(productionConfigProblems({ NODE_ENV: "production" }).length, 1, "missing");
      assert.strictEqual(productionConfigProblems({ NODE_ENV: "production", JWT_SECRET: DEV_JWT_SECRET }).length, 1, "dev default");
      assert.strictEqual(productionConfigProblems({ NODE_ENV: "production", JWT_SECRET: "short" }).length, 1, "too short");
      assert.deepStrictEqual(productionConfigProblems({ NODE_ENV: "production", JWT_SECRET: "x".repeat(32) }), []);
    });
  });

  describe("S14 CORS: which web addresses may call the API", () => {
    const preflight = async (origin: string) => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
      });
      return res.headers.get("access-control-allow-origin");
    };

    it("S14: outside production, the web app works from any loopback address and port", async () => {
      assert.strictEqual(await preflight("http://localhost:3000"), "http://localhost:3000");
      assert.strictEqual(await preflight("http://127.0.0.1:3000"), "http://127.0.0.1:3000", "the address that used to fail with NetworkError");
      assert.strictEqual(await preflight("http://localhost:3001"), "http://localhost:3001", "Next.js moves to 3001 when 3000 is busy");
      assert.strictEqual(await preflight("http://[::1]:3000"), "http://[::1]:3000");
    });

    it("S14: other sites are still refused, even in development", async () => {
      assert.strictEqual(await preflight("http://evil.example"), null);
      assert.strictEqual(await preflight("http://localhost.evil.example:3000"), null, "lookalike host");
      assert.strictEqual(await preflight("http://127.0.0.1.nip.io:3000"), null, "lookalike IP");
      assert.strictEqual(await preflight("https://localhost:3000"), null, "dev web app is plain http");
    });

    it("S14: production allows only WEB_ORIGIN (comma-separated), never loopback by default", () => {
      const prod = { NODE_ENV: "production", WEB_ORIGIN: "https://ops.example.edu, https://www.ops.example.edu/" };
      assert.strictEqual(isAllowedWebOrigin("https://ops.example.edu", prod), true);
      assert.strictEqual(isAllowedWebOrigin("https://www.ops.example.edu", prod), true, "trailing slash and spaces ignored");
      assert.strictEqual(isAllowedWebOrigin("http://127.0.0.1:3000", prod), false);
      assert.strictEqual(isAllowedWebOrigin("http://localhost:3000", prod), false);
      assert.strictEqual(isAllowedWebOrigin("http://localhost:3000", { NODE_ENV: "production" }), true, "unset WEB_ORIGIN keeps the old default");
    });
  });

  describe("S3 proposal PDFs", () => {
    it("S3: only real PDFs are accepted (checked by bytes, not by the declared type)", () => {
      assert.strictEqual(proposalPdfProblem(undefined), null, "a proposal is optional");
      assert.strictEqual(proposalPdfProblem(REAL_PDF), null);
      assert.ok(proposalPdfProblem(HTML_AS_PDF));
      assert.ok(proposalPdfProblem("https://example.com/plan.pdf"));
      assert.ok(proposalPdfProblem("data:application/pdf;base64,"));
      const huge = `data:application/pdf;base64,${Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(10 * 1024 * 1024)]).toString("base64")}`;
      assert.ok(proposalPdfProblem(huge), "over 10 MB");
    });

    it("S3: a bid with a fake PDF is rejected with 400", async () => {
      const body = { proposedAmount: 1000, estimatedCompletionTime: "3 days", message: "x", relevantSkills: "y", proposalPdfUrl: HTML_AS_PDF };
      const res = await call("POST", `/opportunities/${SEC_OPP_ID}/bids`, { as: "studentA", body });
      assert.strictEqual(res.status, 400);
      assert.match(res.json.message, /not a valid PDF/);
    });

    it("S3: stored non-PDF files download as attachments, never as a page", async () => {
      const res = await fetch(`${baseUrl}/opportunities/${SEC_OPP_ID}/bids/${LEGACY_HTML_BID.id}/proposal?disposition=inline`, {
        headers: { Authorization: `Bearer ${createToken(testUsers.analyst)}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("content-type"), "application/octet-stream");
      assert.match(res.headers.get("content-disposition") || "", /^attachment;/);
      assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
    });

    it("S3: real PDFs may open inline, and odd file names can't break the header", async () => {
      const res = await fetch(`${baseUrl}/opportunities/${SEC_OPP_ID}/bids/${PDF_BID.id}/proposal?disposition=inline`, {
        headers: { Authorization: `Bearer ${createToken(testUsers.analyst)}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("content-type"), "application/pdf");
      assert.match(res.headers.get("content-disposition") || "", /^inline;/);
      assert.strictEqual(res.headers.get("x-injected"), null);
    });
  });

  describe("S5 sessions", () => {
    it("S5: a signed token for an account that isn't active is refused", async (t) => {
      if (!isDbConnected()) return t.skip("needs MongoDB (demo data has no stored sessions)");
      const res = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${createToken(PENDING_USER)}` } });
      assert.strictEqual(res.status, 401);
    });
  });

  describe("S7 headers", () => {
    it("S7: security headers are set on API responses", async () => {
      const res = await call("GET", "/health");
      assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
      assert.ok(res.headers.get("x-frame-options"));
      assert.strictEqual(res.headers.get("x-powered-by"), null, "doesn't advertise Express");
    });
  });

  describe("S8 body size", () => {
    it("S8: normal routes refuse large bodies with a JSON 413", async () => {
      const res = await call("POST", "/auth/login", { body: { email: "a@b.c", password: "x".repeat(200 * 1024) } });
      assert.strictEqual(res.status, 413);
      assert.strictEqual(typeof res.json.message, "string");
    });

    it("S8: upload routes still accept large files (the PDF check runs, not the size limit)", async () => {
      const big = `data:application/pdf;base64,${b64("<html>" + "x".repeat(300 * 1024))}`;
      const body = { proposedAmount: 1000, estimatedCompletionTime: "3 days", message: "x", relevantSkills: "y", proposalPdfUrl: big };
      const res = await call("POST", `/opportunities/${SEC_OPP_ID}/bids`, { as: "studentA", body });
      assert.strictEqual(res.status, 400, "reached the handler");
      assert.match(res.json.message, /not a valid PDF/);
    });
  });

  describe("S9 rate limits", () => {
    it("S9: write routes are limited per user", async () => {
      process.env.RATE_LIMIT_MESSAGES = "2";
      resetRateLimits();
      try {
        // Replies to a conversation that doesn't exist: counted, but nothing is created
        const statuses: number[] = [];
        for (let i = 0; i < 3; i++) statuses.push((await call("POST", "/messages/no-such-thread/replies", { as: "studentA", body: { body: "hi" } })).status);
        assert.notStrictEqual(statuses[1], 429);
        assert.strictEqual(statuses[2], 429);
        // Another user has their own allowance
        assert.notStrictEqual((await call("POST", "/messages/no-such-thread/replies", { as: "studentB", body: { body: "hi" } })).status, 429);
      } finally {
        delete process.env.RATE_LIMIT_MESSAGES;
        resetRateLimits();
      }
    });
  });

  describe("S10 earnings screenshots", () => {
    it("S10: screenshots must be real images", async () => {
      assert.strictEqual(screenshotProblem(`data:image/png;base64,${TINY_PNG}`), null);
      assert.ok(screenshotProblem("javascript:alert(1)"));
      assert.ok(screenshotProblem("https://example.com/proof.png"));
      assert.ok(screenshotProblem(`data:image/png;base64,${b64("<svg onload=alert(1)>")}`));

      const res = await call("POST", "/earnings", { as: "studentA", body: { platformName: "Upwork", originalAmount: 10, screenshotUrl: "javascript:alert(1)" } });
      assert.strictEqual(res.status, 400);
    });
  });

  describe("S11 error messages", () => {
    it("S11: database internals are replaced with friendly messages", () => {
      assert.deepStrictEqual(sanitizeErrorMessage(400, "E11000 duplicate key error collection: edurev.bids"), { status: 409, message: "This record already exists." });
      assert.strictEqual(sanitizeErrorMessage(500, "MongoNetworkError: connection refused")?.status, 500);
      assert.strictEqual(sanitizeErrorMessage(404, "Opportunity not found."), null, "normal messages pass through");
    });

    it("S11: invalid JSON returns a JSON 400", async () => {
      const res = await fetch(`${baseUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(typeof ((await res.json()) as { message?: unknown }).message, "string");
    });
  });

  describe("S12 hour log", () => {
    it("S12: hours are validated and the response says they aren't stored yet", async () => {
      assert.strictEqual((await call("POST", "/hours", { as: "studentA", body: { hours: "lots" } })).status, 400);
      assert.strictEqual((await call("POST", "/hours", { as: "studentA", body: { hours: 30 } })).status, 400);
      const ok = await call("POST", "/hours", { as: "studentA", body: { hours: 2, role: "ADMINISTRATOR" } });
      assert.strictEqual(ok.status, 201);
      assert.deepStrictEqual(ok.json.data, { studentId: "stu-202", hours: 2 }, "unknown fields are not echoed back");
      assert.match(ok.json.note, /not stored/);
    });
  });
});
