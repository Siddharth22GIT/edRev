"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconMenu, IconSearch } from "@/components/ui/icons";
import { useAuth } from "@/lib/auth-context";
import { isCurrentRoute, navigationFor } from "@/lib/navigation";
import { useWorkQueue } from "@/lib/work-queue";

/** Phone-only tab bar: the three most used pages for the role, search, and the full menu. */
export function BottomNav({ onOpenSearch, onOpenMenu }: { onOpenSearch: () => void; onOpenMenu: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { counts } = useWorkQueue();
  const items = navigationFor(user?.role).slice(0, 3);

  const tab = "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-bold transition";

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[#E6E6E6] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {items.map((item) => {
        const current = isCurrentRoute(pathname, item.href);
        const count = user?.preferences?.showBadges === false ? 0 : counts[item.href] ?? 0;
        return (
          <Link className={`${tab} ${current ? "text-[#C27803]" : "text-[#8C93A0]"}`} href={item.href} key={item.href}>
            <span className="relative">
              <item.icon size={20} />
              {count > 0 && (
                <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#F2A65A] px-1 text-[9px] font-extrabold text-[#30343B] ring-2 ring-white">
                  {count}
                </span>
              )}
            </span>
            {item.label}
          </Link>
        );
      })}
      <button className={`${tab} text-[#8C93A0]`} onClick={onOpenSearch} type="button">
        <IconSearch size={20} />
        Search
      </button>
      <button className={`${tab} text-[#8C93A0]`} onClick={onOpenMenu} type="button">
        <IconMenu size={20} />
        Menu
      </button>
    </nav>
  );
}
