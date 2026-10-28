import type { Student } from "@edurev/types";

export interface CompletenessItem {
  label: string;
  done: boolean;
  href: string;
}

/** How complete a student's profile is, and what is still missing (each item links to where to fix it). */
export function profileCompleteness(student: Student): { percent: number; items: CompletenessItem[]; missing: CompletenessItem[] } {
  const items: CompletenessItem[] = [
    { label: "Finish onboarding", done: Boolean(student.onboardingCompletedAt), href: "/onboarding" },
    { label: "Add a profile photo", done: Boolean(student.photoUrl), href: "/profile?action=change-photo" },
    { label: "List at least 3 skills", done: student.skills.length >= 3, href: "/profile?tab=skills" },
    { label: "Pick your interests", done: (student.interests?.length ?? 0) > 0, href: "/onboarding" },
    { label: "Write a short bio", done: Boolean(student.bio), href: "/profile?tab=edit" },
    { label: "Add a portfolio link", done: (student.portfolioLinks?.length ?? 0) > 0, href: "/onboarding" },
    { label: "Add your phone and location", done: Boolean(student.phone && student.location), href: "/profile?tab=edit" },
  ];
  const doneCount = items.filter((item) => item.done).length;
  return { percent: Math.round((doneCount / items.length) * 100), items, missing: items.filter((item) => !item.done) };
}
