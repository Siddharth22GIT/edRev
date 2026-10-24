"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  IconAnalytics,
  IconDashboard,
  IconEarnings,
  IconOpportunities,
  IconProposals,
  IconSafeguards,
  IconSettings,
  IconStudents,
  IconX,
} from "@/components/ui/icons";

export interface NavigationItem {
  href: string;
  label: string;
  icon: typeof IconDashboard;
}

export const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard },
  { href: "/opportunities", label: "Opportunities", icon: IconOpportunities },
  { href: "/students", label: "Students", icon: IconStudents },
  { href: "/earnings", label: "Earnings", icon: IconEarnings },
  { href: "/proposals", label: "Proposals", icon: IconProposals },
  { href: "/safeguards", label: "Safeguards", icon: IconSafeguards },
  { href: "/analytics", label: "Analytics", icon: IconAnalytics },
];

function isCurrentRoute(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  const roleLabels: Record<string, string> = {
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

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col border-r border-[#E6E6E6] bg-white px-4 py-5 text-[#30343B] shadow-sm transition-transform lg:translate-x-0 ${
        open ? "translate-x-0" : ""
      }`}
    >
      {/* Brand Header */}
      <div className="mb-6 flex items-center justify-between px-2">
        <Link className="flex items-center gap-3" href="/dashboard" onClick={onNavigate}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F2A65A] text-lg font-black text-[#30343B] shadow-sm ring-2 ring-[#FBD7B3]">
            R
          </div>
          <div>
            <span className="block text-base font-extrabold tracking-tight text-[#30343B]">REVALANCHE</span>
            <span className="block text-[11px] font-semibold text-[#3978B8]">Institutional Earning OS</span>
          </div>
        </Link>
        <button
          className="rounded-lg p-1.5 text-[#666D7A] hover:bg-[#F7F7F6] lg:hidden"
          onClick={onNavigate}
          type="button"
          aria-label="Close menu"
        >
          <IconX size={18} />
        </button>
      </div>

      {/* Main Navigation */}
      <div className="px-2 mb-2 text-[10px] font-bold uppercase tracking-wider text-[#8C93A0]">
        Workspace Navigation
      </div>
      <nav aria-label="Main navigation" className="space-y-1">
        {navigation.map((item) => {
          const current = isCurrentRoute(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                current
                  ? "bg-[#FEF6EE] text-[#30343B] border-l-4 border-[#F2A65A] shadow-xs"
                  : "text-[#666D7A] hover:bg-[#F7F7F6] hover:text-[#30343B]"
              }`}
              href={item.href}
              key={item.href}
              onClick={onNavigate}
            >
              <span
                className={`grid h-5 w-5 place-items-center transition-colors ${
                  current ? "text-[#C27803]" : "text-[#8C93A0] group-hover:text-[#3978B8]"
                }`}
              >
                <Icon size={18} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Settings & Session Context */}
      <div className="mt-auto border-t border-[#E6E6E6] pt-4">
        <Link
          className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
            pathname === "/settings"
              ? "bg-[#FEF6EE] text-[#30343B] border-l-4 border-[#F2A65A]"
              : "text-[#666D7A] hover:bg-[#F7F7F6] hover:text-[#30343B]"
          }`}
          href="/settings"
          onClick={onNavigate}
        >
          <span
            className={`grid h-5 w-5 place-items-center ${
              pathname === "/settings" ? "text-[#C27803]" : "text-[#8C93A0] group-hover:text-[#3978B8]"
            }`}
          >
            <IconSettings size={18} />
          </span>
          <span>Settings</span>
        </Link>

        <div className="mt-4 rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] p-3 text-xs text-[#666D7A]">
          <div className="flex items-center justify-between pb-1.5 border-b border-[#E6E6E6]">
            <span className="font-bold text-[10px] uppercase tracking-wider text-[#30343B]">Session Active</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
          </div>
          {user ? (
            <div className="mt-2">
              <p className="font-bold text-[#30343B] truncate">{user.name}</p>
              <p className="text-[11px] font-semibold text-[#3978B8] mt-0.5">
                {roleLabels[user.role] || user.role}
              </p>
            </div>
          ) : (
            <div className="mt-2">
              <Link className="font-bold text-[#3978B8] hover:underline" href="/login">
                Sign In to Platform →
              </Link>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
