import { can, type Role } from "@edurev/types";
import {
  IconAnalytics,
  IconDashboard,
  IconEarnings,
  IconOpportunities,
  IconProposals,
  IconSafeguards,
  IconStudents,
} from "@/components/ui/icons";

export interface NavigationItem {
  href: string;
  label: string;
  icon: typeof IconDashboard;
  /** Which signed-in roles get something useful from this page. Defaults to everyone. */
  visibleTo?: (role: Role) => boolean;
}

export const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard },
  { href: "/opportunities", label: "Opportunities", icon: IconOpportunities },
  // Students reach their own record through "My profile"; the cohort list is for staff
  { href: "/students", label: "Students", icon: IconStudents, visibleTo: (role) => can(role, "STUDENT_RECORDS_VIEW") },
  {
    href: "/earnings",
    label: "Earnings",
    icon: IconEarnings,
    // Students record their own earnings; only institutional roles may read the ledger (API returns 403 otherwise)
    visibleTo: (role) => can(role, "EARNINGS_SUBMIT") || can(role, "EARNINGS_VIEW_ALL"),
  },
  { href: "/proposals", label: "Proposals", icon: IconProposals },
  { href: "/safeguards", label: "Safeguards", icon: IconSafeguards },
  { href: "/analytics", label: "Analytics", icon: IconAnalytics, visibleTo: (role) => can(role, "ANALYTICS_VIEW") },
];

export function navigationFor(role: Role | undefined): NavigationItem[] {
  if (!role) return [];
  return navigation.filter((item) => !item.visibleTo || item.visibleTo(role));
}

/** Settings links: everyone gets Account settings; institution-wide settings are for SETTINGS_MANAGE. */
export function settingsLinksFor(role: Role | undefined): { href: string; label: string }[] {
  if (!role) return [];
  return [
    { href: "/settings/account", label: "Account settings" },
    ...(can(role, "SETTINGS_MANAGE") ? [{ href: "/settings", label: "Institutional settings" }] : []),
  ];
}

export function isCurrentRoute(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

export const roleLabels: Record<Role, string> = {
  STUDENT: "Student",
  BID_DESK_ANALYST: "Bid Desk Analyst",
  PROPOSAL_EDITOR: "Proposal Editor",
  GUILD_LEAD: "Guild Lead / Mentor",
  CELL_COORDINATOR: "Cell Coordinator",
  FACULTY_DIRECTOR: "Faculty Director",
  PLACEMENT_OFFICE: "Placement Office",
  DEAN: "Dean",
  ADMINISTRATOR: "Administrator",
};
