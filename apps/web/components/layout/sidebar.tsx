"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavigationItem {
  href: string;
  label: string;
  symbol: string;
}

export const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", symbol: "⌂" },
  { href: "/opportunities", label: "Opportunities", symbol: "◈" },
  { href: "/students", label: "Students", symbol: "◉" },
  { href: "/earnings", label: "Earnings", symbol: "₹" },
  { href: "/proposals", label: "Proposals", symbol: "✦" },
  { href: "/safeguards", label: "Safeguards", symbol: "✓" },
  { href: "/analytics", label: "Analytics", symbol: "↗" },
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

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col border-r border-slate-800 bg-slate-950 px-3 py-5 text-slate-300 transition-transform lg:translate-x-0 ${open ? "translate-x-0" : ""}`}>
      <Link className="mb-9 flex items-center gap-3 px-3" href="/dashboard" onClick={onNavigate}>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-lg font-bold text-white">E</span>
        <span>
          <span className="block text-base font-bold tracking-tight text-white">EduRev</span>
          <span className="block text-xs text-slate-400">Operations workspace</span>
        </span>
      </Link>

      <nav aria-label="Main navigation" className="space-y-1">
        {navigation.map((item) => {
          const current = isCurrentRoute(pathname, item.href);
          return (
            <Link
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${current ? "bg-blue-600 text-white" : "hover:bg-slate-900 hover:text-white"}`}
              href={item.href}
              key={item.href}
              onClick={onNavigate}
            >
              <span aria-hidden="true" className="grid h-5 w-5 place-items-center text-base">{item.symbol}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-slate-800 pt-4">
        <Link className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${pathname === "/settings" ? "bg-blue-600 text-white" : "hover:bg-slate-900 hover:text-white"}`} href="/settings" onClick={onNavigate}>
          <span aria-hidden="true">⚙</span> Settings
        </Link>
        <div className="mt-4 rounded-lg bg-slate-900 px-3 py-3 text-xs leading-5 text-slate-400">
          <span className="font-semibold text-slate-200">Week 5 foundation</span><br />
          Static data is ready to be replaced by the API.
        </div>
      </div>
    </aside>
  );
}
