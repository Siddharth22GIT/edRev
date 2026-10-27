import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import type { Role } from "@edurev/types";
import { createApp } from "../app.js";
import { connectDB } from "../config/db.js";
import { seedDatabaseIfEmpty } from "../utils/seed.js";

const JWT_SECRET = process.env.JWT_SECRET || "revalanche_dev_jwt_secret_key_change_in_production";

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  studentId?: string;
}

export function createToken(user: TestUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "1h" });
}

/** One signed-in identity per role, plus a second student for cross-student checks. */
export const testUsers = {
  studentA: { id: "usr-student-202", name: "Rohan Patel", email: "rohan.patel@revalanche.local", role: "STUDENT", studentId: "stu-202" },
  studentB: { id: "usr-student-201", name: "Maya Chen", email: "maya.chen@revalanche.local", role: "STUDENT", studentId: "stu-201" },
  analyst: { id: "usr-analyst", name: "Elena Martin", email: "analyst@revalanche.local", role: "BID_DESK_ANALYST" },
  editor: { id: "usr-editor", name: "Priya Sharma", email: "editor@revalanche.local", role: "PROPOSAL_EDITOR" },
  guild: { id: "usr-guild", name: "Vikram Malhotra", email: "guild@revalanche.local", role: "GUILD_LEAD" },
  coordinator: { id: "usr-coordinator", name: "Ananya Roy", email: "coordinator@revalanche.local", role: "CELL_COORDINATOR" },
  faculty: { id: "usr-faculty", name: "Dr. Sarah Jenkins", email: "faculty@revalanche.local", role: "FACULTY_DIRECTOR" },
  dean: { id: "usr-dean", name: "Dean", email: "dean@revalanche.local", role: "DEAN" },
  admin: { id: "usr-admin", name: "System Administrator", email: "admin@revalanche.local", role: "ADMINISTRATOR" },
} satisfies Record<string, TestUser>;

export type TestUserKey = keyof typeof testUsers;

export const tokens = Object.fromEntries(
  Object.entries(testUsers).map(([key, user]) => [key, createToken(user)])
) as Record<TestUserKey, string>;

/** Connects (or falls back to mock mode), seeds if needed, and starts the app on a random port. */
export async function startTestServer(): Promise<{ server: Server; baseUrl: string; connected: boolean }> {
  const connected = await connectDB();
  if (connected) {
    await seedDatabaseIfEmpty();
  }
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/api`, connected });
    });
  });
}

export async function stopTestServer(server: Server | undefined): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const mongoose = await import("mongoose");
  await mongoose.default.disconnect();
}

/** Small fetch wrapper: `as` picks the signed-in identity (omit for an anonymous request). */
export function makeClient(baseUrl: () => string) {
  return async function call(
    method: string,
    path: string,
    options: { as?: TestUserKey; body?: unknown; headers?: Record<string, string> } = {}
  ) {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...options.headers };
    if (options.as) headers.Authorization = `Bearer ${tokens[options.as]}`;
    const res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const contentType = res.headers.get("content-type") || "";
    // Test assertions inspect arbitrary response shapes, so the parsed body is intentionally untyped
    const json: any = contentType.includes("application/json") ? await res.json() : null;
    return { status: res.status, json, headers: res.headers };
  };
}
