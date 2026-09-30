"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "G";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-slate-50/90 px-4 backdrop-blur lg:px-8">
      <Button aria-label="Open navigation" className="lg:hidden" onClick={onMenuClick} variant="ghost">☰</Button>
      <div className="hidden max-w-md flex-1 lg:block">
        <label className="relative block">
          <span className="sr-only">Search workspace</span>
          <input className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Search students, opportunities…" type="search" />
          <span aria-hidden="true" className="absolute left-3 top-2 text-slate-400">⌕</span>
        </label>
      </div>

      <div className="ml-auto flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                {initials}
              </span>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-tight text-slate-900">{user.name}</p>
                <p className="text-xs font-medium text-slate-500">{user.role}</p>
              </div>
            </div>
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              onClick={logout}
              type="button"
            >
              Logout
            </button>
          </div>
        ) : (
          <Link
            className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
            href="/login"
          >
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
}
