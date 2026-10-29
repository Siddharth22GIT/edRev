import type { NextFunction, Request, Response } from "express";
import { isDbConnected } from "../config/db.js";
import { demoModeAllowed } from "../config/runtime.js";
import { consume } from "../utils/rate-limit.js";

/**
 * S1: when demo data mode isn't allowed (production), a lost database connection returns 503 instead of
 * silently serving mock data and accepting the shared development password.
 */
export function requireDatabaseWhenDemoDisallowed(_req: Request, res: Response, next: NextFunction): void {
  if (!isDbConnected() && !demoModeAllowed()) {
    res.status(503).json({ message: "The service is temporarily unavailable. Please try again in a few minutes." });
    return;
  }
  next();
}

/**
 * S9: per-user rate limit for write actions. Keyed by the signed-in user (not IP), because a whole
 * campus can share one IP address. Limits can be tuned with env vars, e.g. RATE_LIMIT_BIDS=30.
 * Use after `authenticate`.
 */
export function limitPerUser(bucket: string, defaultLimit: number, windowMs: number) {
  const envKey = `RATE_LIMIT_${bucket.toUpperCase()}`;
  return (req: Request, res: Response, next: NextFunction): void => {
    const limit = Number(process.env[envKey] ?? defaultLimit);
    const who = req.user?.id ?? req.ip ?? "anonymous";
    if (!consume(`${bucket}:${who}`, limit, windowMs)) {
      const minutes = Math.round(windowMs / 60000);
      res.status(429).json({ message: `You're doing that too often. Please wait a few minutes and try again (limit: ${limit} per ${minutes} minutes).` });
      return;
    }
    next();
  };
}

/** Database and driver messages that must never reach a user (S11). */
const INTERNAL_ERROR = /E11000|duplicate key|MongoServerError|MongoNetworkError|buffering timed out|Cast to \w+ failed|validation failed|ECONNREFUSED/i;

/** S11: turns an internal error message into a safe `{ status, message }`, or returns null if it's already safe. */
export function sanitizeErrorMessage(status: number, message: unknown): { status: number; message: string } | null {
  if (typeof message !== "string" || !INTERNAL_ERROR.test(message)) return null;
  if (/E11000|duplicate key/i.test(message)) return { status: 409, message: "This record already exists." };
  if (/Cast to \w+ failed|validation failed/i.test(message)) return { status: 400, message: "Some of the submitted values are invalid." };
  return { status: status >= 500 ? status : 500, message: "Something went wrong on our side. Please try again." };
}

/**
 * S11: wraps `res.json` so any error response whose message leaks database internals is replaced with a
 * friendly one. Controllers keep their own `errorResponse` helpers; this is the safety net behind them.
 */
export function sanitizeErrorResponses(_req: Request, res: Response, next: NextFunction): void {
  const json = res.json.bind(res);
  res.json = (body?: any) => {
    if (res.statusCode >= 400 && body && typeof body === "object") {
      const safe = sanitizeErrorMessage(res.statusCode, body.message);
      if (safe) {
        console.error(`[api] ${res.req.method} ${res.req.originalUrl} → ${res.statusCode}: ${body.message}`);
        res.status(safe.status);
        return json({ ...body, message: safe.message });
      }
    }
    return json(body);
  };
  next();
}

/** S11: last-resort handler for thrown errors (bad JSON, body too large, unexpected crashes). Always `{ message }`. */
export function jsonErrorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;
  if (err?.type === "entity.too.large") {
    res.status(413).json({ message: "The request is too large." });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ message: "The request body is not valid JSON." });
    return;
  }
  const status = Number(err?.statusCode || err?.status) || 500;
  if (status >= 500) console.error(`[api] ${req.method} ${req.originalUrl} failed:`, err);
  res.status(status).json({ message: status >= 500 ? "Something went wrong on our side. Please try again." : err?.message || "Request failed." });
}
