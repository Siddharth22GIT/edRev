"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { HealthStatus } from "@edurev/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconChevronDown, IconMenu, IconPlus, IconSearch } from "@/components/ui/icons";
import { API_BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { quickActionsFor, runQuickAction } from "@/lib/quick-actions";
import { ProfileMenu } from "./profile-menu";

export function Topbar({ onMenuClick, onOpenSearch }: { onMenuClick: () => void; onOpenSearch: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [demoMode, setDemoMode] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const actions = quickActionsFor(user?.role);

  // Close the "+ New" menu when clicking elsewhere
  useEffect(() => {
    if (!newMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!newMenuRef.current?.contains(e.target as Node)) setNewMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [newMenuOpen]);

  // Surface the API's in-memory fallback instead of letting it go unnoticed
  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((res) => (res.ok ? res.json() : null))
      .then((health: HealthStatus | null) => setDemoMode(health?.db === "mock"))
      .catch(() => setDemoMode(false));
  }, []);

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

      {/* Search opens the Ctrl+K command bar */}
      <div className="hidden max-w-md flex-1 md:block">
        <button
          className="flex w-full items-center gap-2.5 rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] py-2 pl-3 pr-2 text-left text-sm text-[#8C93A0] transition hover:border-[#C2DCF2] hover:bg-white"
          onClick={onOpenSearch}
          type="button"
        >
          <IconSearch size={16} />
          <span className="flex-1">Search or jump to…</span>
          <kbd className="rounded-md border border-[#E6E6E6] bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#8C93A0]">Ctrl K</kbd>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {actions.length > 0 && (
          <div className="relative" ref={newMenuRef}>
            <Button aria-expanded={newMenuOpen} className="px-3 py-1.5 text-xs" onClick={() => setNewMenuOpen((o) => !o)} variant="primary">
              <IconPlus size={14} />
              <span className="hidden sm:inline">New</span>
              <IconChevronDown size={14} />
            </Button>
            {newMenuOpen && (
              <div className="rise-in absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-[#E6E6E6] bg-white p-1.5 shadow-dropdown" role="menu">
                {actions.map((action) => (
                  <button
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-[#FEF6EE]"
                    key={action.id}
                    onClick={() => {
                      setNewMenuOpen(false);
                      runQuickAction(action, pathname, router.push);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#FEF6EE] text-[#C27803]">
                      <IconPlus size={14} />
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-[#30343B]">{action.label}</span>
                      <span className="block text-xs text-[#666D7A]">{action.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {demoMode && (
          <span title="MongoDB is not connected. The API is serving in-memory demo data and changes are not saved.">
            <Badge tone="amber">Demo data mode</Badge>
          </span>
        )}
        {user ? (
          <ProfileMenu />
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
