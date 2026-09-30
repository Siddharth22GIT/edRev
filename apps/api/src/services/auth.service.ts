import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { AuthResponse, User } from "@edurev/types";
import { isDbConnected } from "../config/db.js";
import { UserModel } from "../models/index.js";
import { DEV_DEFAULT_PASSWORD, seedUsersList } from "../utils/seed.js";

const JWT_SECRET = process.env.JWT_SECRET || "revalanche_dev_jwt_secret_key_change_in_production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// Pre-calculate hash for mock/fallback mode
let mockHashCache: string | null = null;
async function getMockHash() {
  if (!mockHashCache) {
    mockHashCache = await bcrypt.hash(DEV_DEFAULT_PASSWORD, 10);
  }
  return mockHashCache;
}

export async function loginService(email: string, password: string): Promise<AuthResponse> {
  let user: User | null = null;

  if (isDbConnected()) {
    user = await UserModel.findOne({ email }).lean<User>();
  } else {
    const seedUser = seedUsersList.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (seedUser) {
      user = {
        ...seedUser,
        passwordHash: await getMockHash(),
      };
    }
  }

  if (!user || !user.passwordHash) {
    const err: any = new Error("Invalid email or password.");
    err.statusCode = 401;
    throw err;
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    const err: any = new Error("Invalid email or password.");
    err.statusCode = 401;
    throw err;
  }

  const tokenPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.studentId,
  };

  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });

  const { passwordHash: _, ...safeUser } = user;
  return {
    token,
    user: safeUser,
  };
}

export async function getMeService(userId: string): Promise<Omit<User, "passwordHash">> {
  let user: User | null = null;

  if (isDbConnected()) {
    user = await UserModel.findOne({ id: userId }).lean<User>();
  } else {
    const seedUser = seedUsersList.find((u) => u.id === userId);
    if (seedUser) {
      user = {
        ...seedUser,
        passwordHash: "",
      };
    }
  }

  if (!user) {
    const err: any = new Error("User not found.");
    err.statusCode = 404;
    throw err;
  }

  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

export function verifyJwtToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    const err: any = new Error("Invalid or expired token.");
    err.statusCode = 401;
    throw err;
  }
}
