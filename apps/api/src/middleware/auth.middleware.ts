import type { NextFunction, Request, Response } from "express";
import type { Role, User } from "@edurev/types";
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
