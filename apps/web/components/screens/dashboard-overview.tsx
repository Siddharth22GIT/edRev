"use client";

import { useAuth } from "@/lib/auth-context";
import { StaffDashboard } from "./dashboard/staff-dashboard";
import { StudentDashboard } from "./dashboard/student-dashboard";

/**
 * Role-aware home (Phase 3, docs/modules/ui-shell.md). The screens live one-per-file in `screens/dashboard/`;
 * this file keeps the page import stable.
 */
export function DashboardOverview() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "STUDENT" ? <StudentDashboard /> : <StaffDashboard />;
}
