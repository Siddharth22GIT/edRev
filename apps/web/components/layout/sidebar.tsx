"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { isCurrentRoute, navigationFor, settingsLinksFor } from "@/lib/navigation";
import { useWorkQueue } from "@/lib/work-queue";
import { CountBadge } from "@/components/ui/count-badge";
import { LogoMark } from "@/components/ui/logo";
import { IconChevronRight, IconSettings, IconX } from "@/components/ui/icons";

interface SidebarProps {
  /** Phone/tablet drawer is open. */
  open: boolean;
  onNavigate: () => void;
  /** U3: desktop rail shows icons only. The phone drawer always shows labels. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

/**
 * U3: the orange icon rail (docs/modules/ui-shell.md). Built from `navigationFor(role)`, so a role only sees the
 * pages it may use. On desktop it can be collapsed to icons with tooltips (saved in `user.preferences.navCollapsed`);
 * on smaller screens it is a slide-in drawer. Text and icons are charcoal on orange (6.2:1), never white.
 */
export function Sidebar({ open, onNavigate, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { counts } = useWorkQueue();
  const items = navigationFor(user?.role);
  const showBadges = user?.preferences?.showBadges !== false;

  return (
    <aside
      aria-label="Workspace"
      className={`on-orange fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col bg-brand-orange text-brand-text shadow-lg transition-[transform,width] duration-200 lg:translate-x-0 lg:shadow-none ${
        collapsed ? "lg:w-[var(--rail-width-collapsed)]" : "lg:w-[var(--rail-width)]"
      } ${open ? "translate-x-0" : ""}`}
    >
      {/* Brand */}
      <div className={`flex h-16 shrink-0 items-center justify-between gap-2 border-b border-brand-text/10 px-4 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}>
        <Link aria-label="REVALANCHE dashboard" className="flex min-w-0 items-center gap-2.5 rounded-lg" href="/dashboard" onClick={onNavigate}>
          <LogoMark className="shrink-0 rounded-lg shadow-sm ring-2 ring-white/70" size={36} />
          <span className={`min-w-0 ${collapsed ? "lg:sr-only" : ""}`}>
            <span className="block truncate text-[15px] font-extrabold tracking-tight">REVALANCHE</span>
            <span className="block truncate text-[11px] font-semibold">Institutional Earning OS</span>
          </span>
        </Link>
        <button aria-label="Close menu" className="rounded-lg p-1.5 hover:bg-white/40 lg:hidden" onClick={onNavigate} type="button">
          <IconX size={18} />
        </button>
      </div>

      {/* Main navigation. overflow is only clipped on small screens, so desktop tooltips can sit outside the rail. */}
      <nav aria-label="Main navigation" className={`flex-1 space-y-1 overflow-y-auto px-3 py-4 lg:overflow-visible ${collapsed ? "lg:px-2.5" : ""}`}>
        {items.map((item) => {
          const count = showBadges ? counts[item.href] ?? 0 : 0;
          return (
            <RailLink
              collapsed={collapsed}
              count={count}
              current={isCurrentRoute(pathname, item.href)}
              href={item.href}
              icon={<item.icon size={19} />}
              key={item.href}
              label={item.label}
              onNavigate={onNavigate}
            />
          );
        })}
      </nav>

      {/* Settings + collapse control */}
      <div className={`shrink-0 space-y-1 border-t border-brand-text/10 px-3 py-3 ${collapsed ? "lg:px-2.5" : ""}`}>
        {settingsLinksFor(user?.role).map((link) => (
          <RailLink
            collapsed={collapsed}
            current={pathname === link.href}
            href={link.href}
            icon={<IconSettings size={19} />}
            key={link.href}
            label={link.label}
            onNavigate={onNavigate}
          />
        ))}
        {onToggleCollapsed && (
          <button
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            className={`group relative hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold transition hover:bg-white/40 lg:flex ${collapsed ? "justify-center px-0" : ""}`}
            onClick={onToggleCollapsed}
            type="button"
          >
            <IconChevronRight aria-hidden="true" className={`shrink-0 transition-transform ${collapsed ? "" : "rotate-180"}`} size={18} />
            <span className={collapsed ? "sr-only" : ""}>Collapse menu</span>
            {collapsed && <Tooltip label="Expand menu" />}
          </button>
        )}
      </div>
    </aside>
  );
}

function RailLink({
  href,
  label,
  icon,
  current,
  collapsed,
  count = 0,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  current: boolean;
  collapsed: boolean;
  count?: number;
  onNavigate: () => void;
}) {
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
        current ? "bg-white font-bold shadow-sm" : "hover:bg-white/40"
      } ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
      href={href}
      onClick={onNavigate}
    >
      <span className={`relative grid h-5 w-5 shrink-0 place-items-center ${current ? "text-brand-orange-dark" : ""}`}>
        <span aria-hidden="true">{icon}</span>
        {/* Collapsed rail: the count sits on the icon */}
        {collapsed && count > 0 && <CountBadge className="absolute -right-3 -top-2.5 hidden h-4 min-w-4 px-1 text-[9px] ring-2 ring-brand-orange lg:inline-grid" count={count} tone="dark" />}
      </span>
      <span className={`min-w-0 flex-1 truncate ${collapsed ? "lg:sr-only" : ""}`}>{label}</span>
      {count > 0 && <CountBadge className={collapsed ? "lg:hidden" : ""} count={count} tone="dark" />}
      {collapsed && <Tooltip label={label} />}
    </Link>
  );
}

/** Desktop-only label shown beside a collapsed rail icon on hover or keyboard focus. */
function Tooltip({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-brand-text px-2.5 py-1 text-xs font-semibold text-white shadow-dropdown lg:group-hover:block lg:group-focus-visible:block"
    >
      {label}
    </span>
  );
}
