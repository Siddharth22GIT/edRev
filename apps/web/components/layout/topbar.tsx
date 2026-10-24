"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconMenu, IconSearch } from "@/components/ui/icons";
import { useAuth } from "@/lib/auth-context";

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

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[#E6E6E6] bg-white/95 px-4 backdrop-blur lg:px-8 shadow-xs">
      <button
        aria-label="Open navigation"
        className="rounded-lg p-2 text-[#666D7A] hover:bg-[#F7F7F6] lg:hidden"
        onClick={onMenuClick}
        type="button"
      >
        <IconMenu size={20} />
      </button>

      {/* Institutional Breadcrumb & Search */}
      <div className="hidden max-w-md flex-1 md:block">
        <label className="relative block">
          <span className="sr-only">Search workspace</span>
          <input
            className="w-full rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] py-2 pl-9 pr-3 text-sm text-[#30343B] outline-none placeholder:text-[#8C93A0] transition focus:border-[#3978B8] focus:bg-white focus:ring-2 focus:ring-[#C2DCF2]"
            placeholder="Search students, opportunities, proposals…"
            type="search"
          />
          <span aria-hidden="true" className="absolute left-3 top-2.5 text-[#8C93A0]">
            <IconSearch size={16} />
          </span>
        </label>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 border-l border-[#E6E6E6] pl-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#FEF6EE] text-xs font-black text-[#C27803] ring-2 ring-[#FBD7B3]">
                {initials}
              </span>
              <div className="hidden sm:block">
                <p className="text-sm font-bold leading-tight text-[#30343B]">{user.name}</p>
                <div className="mt-0.5">
                  <Badge tone="blue">{roleLabels[user.role] || user.role}</Badge>
                </div>
              </div>
            </div>
            <Button
              className="px-3 py-1.5 text-xs"
              onClick={logout}
              variant="secondary"
            >
              Logout
            </Button>
          </div>
        ) : (
          <Link
            className="rounded-xl bg-[#F2A65A] px-4 py-2 text-xs font-bold text-[#30343B] shadow-sm transition hover:bg-[#E59443] ring-1 ring-[#FBD7B3]"
            href="/login"
          >
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
}
