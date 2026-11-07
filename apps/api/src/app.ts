import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { HealthStatus } from "@edurev/types";
import { isDbConnected } from "./config/db.js";
import { isAllowedWebOrigin } from "./config/runtime.js";
import { jsonErrorHandler, requireDatabaseWhenDemoDisallowed, sanitizeErrorResponses } from "./middleware/security.middleware.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import authRoutes from "./routes/auth.routes.js";
import earningsRoutes from "./routes/earnings.routes.js";
import opportunityRoutes from "./routes/opportunity.routes.js";
import safeguardRoutes from "./routes/safeguard.routes.js";
import studentRoutes from "./routes/student.routes.js";
import messagesRoutes from "./routes/messages.routes.js";
import signupRequestRoutes from "./routes/signup-request.routes.js";
import tierSuggestionRoutes from "./routes/tier-suggestion.routes.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      // S14: WEB_ORIGIN (comma-separated) everywhere; any loopback origin too outside production.
      // Requests without an Origin header (curl, server-to-server) aren't affected by CORS.
      origin: (origin, callback) => callback(null, !origin || isAllowedWebOrigin(origin)),
      // Lets the web app read the filename of downloaded proposal documents
      exposedHeaders: ["Content-Disposition"],
    })
  );
  // S7: standard security headers (nosniff, frame blocking, no referrer leaks…). Cross-origin resource
  // policy stays open because the web app on another port reads API responses.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(sanitizeErrorResponses);

  // S8: small bodies by default; only the upload routes accept files (sent as data URLs).
  // The first parser that runs wins, so the route-specific ones must come before the default one.
  const uploadJson = express.json({ limit: "15mb" }); // ≤ 10 MB file + base64 overhead
  app.post("/api/opportunities/:id/bids", uploadJson);
  app.post("/api/earnings", uploadJson);
  app.put("/api/students/:id/photo", express.json({ limit: "1mb" })); // photos are ≤ 512 KB
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));

  // Health check endpoint (public). `db: "mock"` means the API is serving in-memory demo data.
  app.get("/api/health", (_req, res) => {
    const body: HealthStatus = { status: "ok", service: "edurev-api", db: isDbConnected() ? "connected" : "mock" };
    res.json(body);
  });

  // S1: in production, never fall back to demo data (and its shared dev password) when MongoDB drops
  app.use("/api", requireDatabaseWhenDemoDisallowed);

  // Mount feature routers under /api
  app.use("/api/auth", authRoutes);
  app.use("/api/opportunities", opportunityRoutes);
  app.use("/api/students", studentRoutes);
  app.use("/api/tier-suggestions", tierSuggestionRoutes);
  app.use("/api/signup-requests", signupRequestRoutes);
  app.use("/api/messages", messagesRoutes);
  app.use("/api", earningsRoutes);
  app.use("/api", safeguardRoutes);
  app.use("/api", analyticsRoutes);

  // Fallback 404 handler
  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found." });
  });

  // S11: thrown errors (invalid JSON, body too large, crashes) always come back as `{ message }`
  app.use(jsonErrorHandler);

  return app;
}
