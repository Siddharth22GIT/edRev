"use client";

import Link from "next/link";
import { CountBadge } from "@/components/ui/count-badge";
import { IconUser } from "@/components/ui/icons";
import { useAuth } from "@/lib/auth-context";
import { navigationFor, type NavigationItem } from "@/lib/navigation";
import { useWorkQueue } from "@/lib/work-queue";

/** Everyone has a profile page; it isn't in the rail (it lives in the profile menu), so it's added here. */
const profileLink: NavigationItem = { href: "/profile", label: "My profile", icon: IconUser };

/**
 * U6: a row of shortcuts with red "waiting" counts from useWorkQueue(). Built from navigationFor(role),
 * so a link the role may not use never appears. Respects the "Menu count badges" preference.
 */
export function QuickLinks() {
  const { user } = useAuth();
  const { counts } = useWorkQueue();
  const showBadges = user?.preferences?.showBadges !== false;
  const links = [...navigationFor(user?.role).filter((item) => item.href !== "/dashboard"), profileLink];

  return (
    <nav aria-label="Quick links" className="!mt-4">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]">
        {links.map((item) => {
          const count = showBadges ? counts[item.href] ?? 0 : 0;
          return (
            <li key={item.href}>
              <Link
                className="group relative flex h-full flex-col items-center gap-1.5 rounded-card border border-brand-border bg-brand-card px-2 py-3 text-center text-xs font-bold text-brand-text shadow-card transition hover:border-brand-orange-border hover:bg-brand-orange-light"
                href={item.href}
              >
                <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-brand-orange-light text-brand-orange-dark ring-1 ring-brand-orange-border transition group-hover:bg-brand-orange group-hover:text-brand-text">
                  <item.icon size={18} />
                </span>
                <span className="w-full truncate">{item.label}</span>
                <CountBadge className="absolute right-1.5 top-1.5" count={count} label={`${count} waiting`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
