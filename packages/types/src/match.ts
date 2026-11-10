// Phase 4 (F4): the real skill match, replacing the stored placeholder `matchScore`.
// "4 of 5 skills" = how many of the opportunity's skills the student lists, plus a small bonus for completed
// training on a skill the student doesn't list yet. Spelling and case differences are smoothed out
// ("React" = "react.js" = "ReactJS"). Doc: docs/modules/bids-and-allocation.md (F4)

/** Common spellings that mean the same skill. Keys and values are already normalised (see `normaliseSkill`). */
const ALIASES: Record<string, string> = {
  reactjs: "react",
  nodejs: "node",
  node: "node",
  js: "javascript",
  ts: "typescript",
  nextjs: "next",
  vuejs: "vue",
  expressjs: "express",
  mongo: "mongodb",
  postgres: "postgresql",
  powerbi: "powerbi",
  msexcel: "excel",
  microsoftexcel: "excel",
  ml: "machinelearning",
  ai: "artificialintelligence",
  ux: "uxdesign",
  ui: "uidesign",
  uiux: "uxdesign",
  seo: "seo",
  py: "python",
  golang: "go",
};

/** "React.js " → "react", "Power BI" → "powerbi", "C++" → "cpp", "C#" → "csharp". */
export function normaliseSkill(skill: string): string {
  const base = skill
    .toLowerCase()
    .trim()
    .replace(/c\+\+/g, "cpp")
    .replace(/c#/g, "csharp")
    .replace(/\.js\b/g, "js")
    .replace(/[^a-z0-9]/g, "");
  return ALIASES[base] ?? base;
}

export interface SkillMatch {
  /** Opportunity skills the student lists. */
  matched: string[];
  /** Opportunity skills the student doesn't list (but may have trained in). */
  missing: string[];
  /** Missing skills covered by completed training (the bonus). */
  trainedFor: string[];
  total: number;
  /** 0–100: matched skills count fully, trained-for ones half. */
  percent: number;
  /** "4 of 5 skills", "4 of 5 skills + 1 from training", or "No skills listed for this work". */
  label: string;
}

/**
 * F4: how well a student's skills fit an opportunity. Empty skill lists are handled: a student with no skills
 * gets 0 with a prompt to add skills (the UI says so); an opportunity with no skills is a 100% "open" match.
 */
export function skillMatch(studentSkills: string[], opportunitySkills: string[], completedTrainingTitles: string[] = []): SkillMatch {
  const wanted = Array.from(new Map(opportunitySkills.filter((s) => s && s.trim()).map((s) => [normaliseSkill(s), s.trim()])).entries());
  if (wanted.length === 0) return { matched: [], missing: [], trainedFor: [], total: 0, percent: 100, label: "No skills listed for this work" };

  const have = new Set(studentSkills.map(normaliseSkill).filter(Boolean));
  const training = completedTrainingTitles.map(normaliseSkill).filter(Boolean);
  const matched: string[] = [];
  const missing: string[] = [];
  const trainedFor: string[] = [];
  for (const [key, original] of wanted) {
    if (have.has(key)) matched.push(original);
    else {
      missing.push(original);
      if (key.length >= 2 && training.some((t) => t.includes(key))) trainedFor.push(original);
    }
  }
  const percent = Math.round(((matched.length + trainedFor.length * 0.5) / wanted.length) * 100);
  const label = `${matched.length} of ${wanted.length} skill${wanted.length === 1 ? "" : "s"}${trainedFor.length ? ` + ${trainedFor.length} from training` : ""}`;
  return { matched, missing, trainedFor, total: wanted.length, percent, label };
}
