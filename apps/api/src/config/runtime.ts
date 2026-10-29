// Runtime safety switches (Phase 1 security, see docs/modules/security.md).

/** The development fallback secret. Fine on a laptop, never acceptable in production. */
export const DEV_JWT_SECRET = "revalanche_dev_jwt_secret_key_change_in_production";

export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

/**
 * S1: demo data mode (in-memory mock data, shared dev password) is only allowed outside production,
 * unless explicitly re-enabled with ALLOW_DEMO_MODE=true (e.g. a classroom demo without MongoDB).
 */
export function demoModeAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isProduction(env) || env.ALLOW_DEMO_MODE === "true";
}

/** S2: problems that must stop a production server from starting. Empty list = safe to start. */
export function productionConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!isProduction(env)) return [];
  const problems: string[] = [];
  const secret = env.JWT_SECRET ?? "";
  if (!secret) problems.push("JWT_SECRET is not set.");
  else if (secret === DEV_JWT_SECRET) problems.push("JWT_SECRET is still the development default.");
  else if (secret.length < 32) problems.push("JWT_SECRET must be at least 32 characters.");
  return problems;
}
