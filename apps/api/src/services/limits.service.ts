import { DEFAULT_SAFEGUARD_LIMITS, safeguardLimitProblems, type SafeguardLimits } from "@edurev/types";
import { settings as mockSettings } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { SettingsModel } from "../models/index.js";

// G1: the safeguard limits live on the institution's Settings record (`safeguardLimits`), merged over the agreed
// defaults, so a missing or partial record always gives a complete set. Doc: docs/modules/safeguards.md §4

function httpError(message: string, statusCode: number) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function merged(stored: Partial<SafeguardLimits> | undefined | null): SafeguardLimits {
  const base = structuredClone(DEFAULT_SAFEGUARD_LIMITS);
  if (!stored || typeof stored !== "object") return base;
  return {
    ...base,
    ...stored,
    parallelProjects: { ...base.parallelProjects, ...(stored.parallelProjects ?? {}) },
    breakPeriods: Array.isArray(stored.breakPeriods) ? stored.breakPeriods : base.breakPeriods,
  };
}

export async function getSafeguardLimitsService(): Promise<SafeguardLimits> {
  if (isDbConnected()) {
    const doc = await SettingsModel.findOne({ id: "default" }, { safeguardLimits: 1 }).lean<{ safeguardLimits?: Partial<SafeguardLimits> }>();
    return merged(doc?.safeguardLimits);
  }
  return merged(mockSettings.safeguardLimits);
}

const EDITABLE = new Set<keyof SafeguardLimits>(Object.keys(DEFAULT_SAFEGUARD_LIMITS) as (keyof SafeguardLimits)[]);

/** Administrator update. Unknown keys are ignored; any value out of range refuses the whole update (400). */
export async function updateSafeguardLimitsService(update: Record<string, unknown>): Promise<SafeguardLimits> {
  const changes: Partial<SafeguardLimits> = {};
  for (const [key, value] of Object.entries(update ?? {})) {
    if (EDITABLE.has(key as keyof SafeguardLimits)) (changes as Record<string, unknown>)[key] = value;
  }
  if (Object.keys(changes).length === 0) throw httpError(`Nothing to update. Editable limits: ${[...EDITABLE].join(", ")}.`, 400);
  if (changes.breakPeriods) {
    changes.breakPeriods = (changes.breakPeriods as any[]).map((r, i) => ({
      id: typeof r?.id === "string" && r.id ? r.id : `break-${Date.now()}-${i}`,
      title: typeof r?.title === "string" ? r.title.trim().slice(0, 80) : r?.title,
      startDate: r?.startDate,
      endDate: r?.endDate,
    }));
  }
  const problems = safeguardLimitProblems(changes);
  if (problems.length > 0) throw httpError(problems.join(" "), 400);

  const next = merged({ ...(await getSafeguardLimitsService()), ...changes });
  if (isDbConnected()) {
    const { organizationName, notificationEmail, weeklyDigestEnabled, timezone } = mockSettings;
    await SettingsModel.updateOne(
      { id: "default" },
      { $set: { safeguardLimits: next }, $setOnInsert: { id: "default", organizationName, notificationEmail, weeklyDigestEnabled, timezone } },
      { upsert: true }
    );
    return next;
  }
  mockSettings.safeguardLimits = next;
  return next;
}
