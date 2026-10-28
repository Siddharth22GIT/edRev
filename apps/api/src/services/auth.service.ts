import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DEFAULT_USER_PREFERENCES, type AuthResponse, type User, type UserPreferences } from "@edurev/types";
import { isDbConnected } from "../config/db.js";
import { UserModel } from "../models/index.js";
import { DEV_DEFAULT_PASSWORD, seedUsersList } from "../utils/seed.js";

const JWT_SECRET = process.env.JWT_SECRET || "revalanche_dev_jwt_secret_key_change_in_production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// Demo data mode keeps preference changes in memory (they reset on restart, like all mock data)
const mockPreferences = new Map<string, Partial<UserPreferences>>();

function withPreferences<T extends { id: string; preferences?: Partial<UserPreferences> }>(user: T): T & { preferences: UserPreferences } {
  const stored = isDbConnected() ? user.preferences : mockPreferences.get(user.id);
  return { ...user, preferences: { ...DEFAULT_USER_PREFERENCES, ...(stored ?? {}) } };
}

// Pre-calculate hash for mock/fallback mode
let mockHashCache: string | null = null;
async function getMockHash() {
  if (!mockHashCache) {
    mockHashCache = await bcrypt.hash(DEV_DEFAULT_PASSWORD, 10);
  }
  return mockHashCache;
}

export async function loginService(rawEmail: string, password: string): Promise<AuthResponse> {
  let user: User | null = null;
  const email = rawEmail.trim().toLowerCase();

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

  // Self-signed-up accounts must be approved first. Only revealed after a correct password.
  if (user.status === "PENDING_APPROVAL") {
    const err: any = new Error("Your account is awaiting approval by your institution. You'll be able to sign in once it's approved.");
    err.statusCode = 403;
    err.code = "ACCOUNT_PENDING";
    throw err;
  }
  if (user.status === "REJECTED") {
    const reason = user.signup?.rejectionReason ? ` Reason: ${user.signup.rejectionReason}` : "";
    const err: any = new Error(`Your sign-up request was not approved.${reason} You can correct your details and apply again.`);
    err.statusCode = 403;
    err.code = "ACCOUNT_REJECTED";
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
    user: withPreferences(safeUser),
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
  return withPreferences(safeUser);
}

/** Changes the signed-in user's password after checking the current one. Not available on demo data. */
export async function changePasswordService(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  if (!isDbConnected()) {
    const err: any = new Error("Passwords can't be changed in demo data mode (no database is connected).");
    err.statusCode = 503;
    throw err;
  }

  const user = await UserModel.findOne({ id: userId });
  if (!user) {
    const err: any = new Error("User not found.");
    err.statusCode = 404;
    throw err;
  }

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) {
    const err: any = new Error("Your current password is incorrect.");
    err.statusCode = 400;
    throw err;
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
}

/** Saves the signed-in user's personal preferences (only known keys, validated by the controller). */
export async function updatePreferencesService(userId: string, update: Partial<UserPreferences>): Promise<UserPreferences> {
  if (isDbConnected()) {
    const user = await UserModel.findOne({ id: userId });
    if (!user) {
      const err: any = new Error("User not found.");
      err.statusCode = 404;
      throw err;
    }
    const current = user.preferences?.toObject?.() ?? user.preferences ?? {};
    user.set("preferences", { ...DEFAULT_USER_PREFERENCES, ...current, ...update });
    await user.save();
    return { ...DEFAULT_USER_PREFERENCES, ...user.preferences.toObject() };
  }

  if (!seedUsersList.some((u) => u.id === userId)) {
    const err: any = new Error("User not found.");
    err.statusCode = 404;
    throw err;
  }
  const merged = { ...DEFAULT_USER_PREFERENCES, ...(mockPreferences.get(userId) ?? {}), ...update };
  mockPreferences.set(userId, merged);
  return merged;
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
