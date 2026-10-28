import type { Role } from "./index";

// Single source of truth for "which roles may do what".
// The API enforces these lists and the web app uses the same lists to decide which controls to show.

export const ALL_ROLES: readonly Role[] = [
  "STUDENT",
  "BID_DESK_ANALYST",
  "PROPOSAL_EDITOR",
  "GUILD_LEAD",
  "CELL_COORDINATOR",
  "FACULTY_DIRECTOR",
  "PLACEMENT_OFFICE",
  "DEAN",
  "ADMINISTRATOR",
];

/** Every institutional (non-student) role. */
export const STAFF_ROLES: readonly Role[] = ALL_ROLES.filter((role) => role !== "STUDENT");

export const PERMISSIONS = {
  /** Publish a new client opportunity. */
  OPPORTUNITY_CREATE: ["BID_DESK_ANALYST", "CELL_COORDINATOR", "ADMINISTRATOR"],
  /** Allocate an opportunity to a bidding student. */
  OPPORTUNITY_ALLOCATE: ["BID_DESK_ANALYST", "CELL_COORDINATOR", "ADMINISTRATOR"],
  /** Submit a bid (always as the authenticated student). */
  BID_SUBMIT: ["STUDENT"],
  /** See every bid on an opportunity and its proposal document. Students only see their own bid. */
  BID_REVIEW: STAFF_ROLES,
  /** View any student's profile, readiness, academic snapshot, safeguards and hours. Students only see their own. */
  STUDENT_RECORDS_VIEW: STAFF_ROLES,
  /** Update another student's training modules and log hours on their behalf. Students may do this for themselves. */
  STUDENT_SUPERVISE: ["GUILD_LEAD", "CELL_COORDINATOR", "FACULTY_DIRECTOR", "ADMINISTRATOR"],
  /** Change a student's official tier. */
  TIER_UPDATE: ["ADMINISTRATOR"],
  /** Override the weekly hour cap for a student. */
  HOUR_CAP_OVERRIDE: ["FACULTY_DIRECTOR", "CELL_COORDINATOR", "ADMINISTRATOR"],
  /** Submit an earnings record (always as the authenticated student). */
  EARNINGS_SUBMIT: ["STUDENT"],
  /** View earnings across all students. Students only see their own. */
  EARNINGS_VIEW_ALL: ["FACULTY_DIRECTOR", "CELL_COORDINATOR", "ADMINISTRATOR", "DEAN", "PLACEMENT_OFFICE"],
  /** Verify or reject a pending earnings record. */
  EARNINGS_VERIFY: ["FACULTY_DIRECTOR", "CELL_COORDINATOR", "ADMINISTRATOR", "DEAN"],
  /** Edit any student's profile details and photo. Students may always edit their own. */
  PROFILE_EDIT_ANY: ["ADMINISTRATOR"],
  /** Record a student's official CGPA (the academic record that safeguards and tier rules use). */
  ACADEMIC_RECORD_MANAGE: ["FACULTY_DIRECTOR", "ADMINISTRATOR"],
  /** Approve or reject student self sign-ups. */
  SIGNUP_REVIEW: ["CELL_COORDINATOR", "ADMINISTRATOR"],
  /** Change institution-wide settings (organisation name, notification email, timezone, digest). */
  SETTINGS_MANAGE: ["ADMINISTRATOR"],
  /** Programme analytics and dashboard metrics. Institutional reporting, not student-facing. */
  ANALYTICS_VIEW: STAFF_ROLES,
  /** Create a proposal. Students are always recorded as the author. */
  PROPOSAL_CREATE: ALL_ROLES,
} satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return Boolean(role) && (PERMISSIONS[permission] as readonly Role[]).includes(role as Role);
}
