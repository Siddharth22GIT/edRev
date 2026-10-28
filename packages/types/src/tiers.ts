import type { Tier } from "./index";

// Single source of truth for tier names and promotion rules. TIER_1 is the lowest, TIER_4 the highest.
// The API uses these rules to *suggest* a tier (an administrator always decides); the web app uses the
// same rules to show students what unlocks the next tier.

export const TIER_ORDER: readonly Tier[] = ["TIER_1", "TIER_2", "TIER_3", "TIER_4"];

export const TIER_INFO: Record<Tier, { rank: number; name: string; description: string }> = {
  TIER_1: { rank: 1, name: "Starter", description: "Every new student starts here." },
  TIER_2: { rank: 2, name: "Skilled", description: "Strong academics and training in progress." },
  TIER_3: { rank: 3, name: "Advanced", description: "Excellent academics and solid training." },
  TIER_4: { rank: 4, name: "Elite", description: "Earned only through a record of on-time client delivery." },
};

export function tierRankOf(tier: Tier): number {
  return TIER_INFO[tier]?.rank ?? 1;
}

export function nextTierOf(tier: Tier): Tier | null {
  const rank = tierRankOf(tier);
  return rank < 4 ? TIER_ORDER[rank] : null;
}

/** Thresholds. TIER_2 and TIER_3 can be reached early from academics; TIER_4 only through delivery. */
export const TIER_RULES = {
  TIER_2: { cgpa: 8.0, training: 40, skills: 2 },
  TIER_3: { cgpa: 9.0, training: 60, skills: 3 },
  TIER_4: { fromTier: "TIER_3" as Tier, completed: 5, onTimeRate: 90 },
} as const;

export interface TierEvaluationInput {
  currentTier: Tier;
  /** Official CGPA from the academic record; null until the institution records it. Never self-reported CGPA. */
  officialCgpa: number | null;
  trainingPercent: number;
  skillsCount: number;
  completedDeliveries: number;
  onTimeDeliveries: number;
}

export interface TierCriterion {
  label: string;
  met: boolean;
}

function onTimeRate(input: TierEvaluationInput): number {
  return input.completedDeliveries > 0 ? Math.round((input.onTimeDeliveries / input.completedDeliveries) * 100) : 0;
}

/** The checklist for reaching `target`, with what is met right now. */
export function tierCriteria(target: Tier, input: TierEvaluationInput): TierCriterion[] {
  if (target === "TIER_1") return [{ label: "Approved student account", met: true }];

  if (target === "TIER_4") {
    const rule = TIER_RULES.TIER_4;
    const rate = onTimeRate(input);
    return [
      { label: `Currently ${rule.fromTier.replace("_", " ")}`, met: input.currentTier === rule.fromTier || input.currentTier === "TIER_4" },
      { label: `${rule.completed}+ delivered projects (now ${input.completedDeliveries})`, met: input.completedDeliveries >= rule.completed },
      { label: `${rule.onTimeRate}%+ delivered on time (now ${input.completedDeliveries ? `${rate}%` : "–"})`, met: input.completedDeliveries > 0 && rate >= rule.onTimeRate },
    ];
  }

  const rule = TIER_RULES[target];
  return [
    {
      label:
        input.officialCgpa === null
          ? `Official CGPA ${rule.cgpa.toFixed(1)}+ (not recorded yet)`
          : `Official CGPA ${rule.cgpa.toFixed(1)}+ (now ${input.officialCgpa.toFixed(2)})`,
      met: input.officialCgpa !== null && input.officialCgpa >= rule.cgpa,
    },
    { label: `Training ${rule.training}%+ (now ${input.trainingPercent}%)`, met: input.trainingPercent >= rule.training },
    { label: `${rule.skills}+ skills listed (now ${input.skillsCount})`, met: input.skillsCount >= rule.skills },
  ];
}

/**
 * The highest tier the record supports, if it is above the current tier. TIER_4 comes only from delivery;
 * a suggestion never moves a student down.
 */
export function suggestTier(input: TierEvaluationInput): { tier: Tier; reasons: string[] } | null {
  for (const target of ["TIER_4", "TIER_3", "TIER_2"] as Tier[]) {
    if (tierRankOf(target) <= tierRankOf(input.currentTier)) continue;
    const criteria = tierCriteria(target, input);
    if (criteria.every((c) => c.met)) return { tier: target, reasons: criteria.map((c) => c.label) };
  }
  return null;
}
