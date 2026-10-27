import type { NextFunction, Request, Response } from "express";
import { can, PERMISSIONS, type Permission, type Role, type User } from "@edurev/types";
import { verifyJwtToken } from "../services/auth.service.js";

// Extend Express Request type to attach user
declare global {
  namespace Express {
    interface Request {
      user?: Omit<User, "passwordHash">;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authentication required. Bearer token missing." });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = verifyJwtToken(token);
    req.user = decoded;
    next();
  } catch (err: any) {
    res.status(401).json({ message: err.message || "Invalid or expired authentication token." });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        message: `Forbidden: Role '${req.user.role}' is not authorized to perform this action. Required role(s): ${roles.join(", ")}.`,
      });
      return;
    }

    next();
  };
}

/** Role guard driven by the shared permission map in @edurev/types. */
export function requirePermission(permission: Permission) {
  return requireRole(...PERMISSIONS[permission]);
}

/** The student record id an authenticated STUDENT acts as, or undefined for other roles. */
export function ownStudentId(user: Request["user"]): string | undefined {
  if (!user || user.role !== "STUDENT") return undefined;
  return user.studentId || user.id;
}

/**
 * Allows a student to act on their own record (the `:param` route value) and any role holding
 * `permission` to act on any record. Everyone else gets 403.
 */
export function requireSelfOrPermission(permission: Permission, param = "id") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }

    const target = req.params[param];
    const ownId = ownStudentId(req.user);
    if (ownId && ownId === target) {
      next();
      return;
    }

    if (can(req.user.role, permission)) {
      next();
      return;
    }

    res.status(403).json({
      message:
        req.user.role === "STUDENT"
          ? "Forbidden: Students can only access their own records."
          : `Forbidden: Role '${req.user.role}' is not authorized to perform this action.`,
    });
  };
}
