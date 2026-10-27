import cors from "cors";
import express from "express";
import type { HealthStatus } from "@edurev/types";
import { isDbConnected } from "./config/db.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import authRoutes from "./routes/auth.routes.js";
import earningsRoutes from "./routes/earnings.routes.js";
import opportunityRoutes from "./routes/opportunity.routes.js";
import safeguardRoutes from "./routes/safeguard.routes.js";
import studentRoutes from "./routes/student.routes.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
      // Lets the web app read the filename of downloaded proposal documents
      exposedHeaders: ["Content-Disposition"],
    })
  );
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

  // Health check endpoint (public). `db: "mock"` means the API is serving in-memory demo data.
  app.get("/api/health", (_req, res) => {
    const body: HealthStatus = { status: "ok", service: "edurev-api", db: isDbConnected() ? "connected" : "mock" };
    res.json(body);
  });

  // Mount feature routers under /api
  app.use("/api/auth", authRoutes);
  app.use("/api/opportunities", opportunityRoutes);
  app.use("/api/students", studentRoutes);
  app.use("/api", earningsRoutes);
  app.use("/api", safeguardRoutes);
  app.use("/api", analyticsRoutes);

  // Fallback 404 handler
  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found." });
  });

  return app;
}
