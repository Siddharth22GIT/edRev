import Link from "next/link";
import type { ReactNode } from "react";
import { IconAlertTriangle, IconArrowRight, IconCalendar, IconClock, IconShield } from "@/components/ui/icons";
import { NOTICE_LABELS, pickNotice, type Notice, type NoticeLevel } from "@/lib/dashboard-items";

const levelStyles: Record<NoticeLevel, { box: string; icon: ReactNode }> = {
  overdue: { box: "border-rose-200 bg-rose-50 text-rose-900", icon: <IconAlertTriangle size={16} /> },
  "at-risk": { box: "border-amber-200 bg-amber-50 text-amber-900", icon: <IconClock size={16} /> },
  soon: { box: "border-brand-blue-border bg-brand-blue-light text-brand-blue-dark", icon: <IconCalendar size={16} /> },
  blackout: { box: "border-brand-border bg-brand-card text-brand-text", icon: <IconShield size={16} /> },
};

/**
 * U5: one line with the single most urgent item (overdue > at risk > deadline soon > exam blackout).
 * Hidden when nothing is urgent. The level is written out ("Overdue"), so it never relies on colour alone.
 */
export function NoticeLine({ notices, moreHref }: { notices: Notice[]; moreHref?: string }) {
  const { top, more } = pickNotice(notices);
  if (!top) return null;
  const style = levelStyles[top.level];

  return (
    <div className={`!mt-4 flex flex-col gap-2 rounded-card border px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3 ${style.box}`} role="status">
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide">
        <span aria-hidden="true">{style.icon}</span>
        {NOTICE_LABELS[top.level]}
      </span>
      <span className="min-w-0 flex-1 sm:truncate" title={top.text}>
        {top.text}
      </span>
      <span className="flex shrink-0 items-center gap-3 text-xs font-bold">
        {more > 0 &&
          (moreHref ? (
            <a className="underline underline-offset-2 hover:no-underline" href={moreHref}>
              +{more} more
            </a>
          ) : (
            <span>+{more} more</span>
          ))}
        <Link className="inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline" href={top.href}>
          {top.cta}
          <IconArrowRight aria-hidden="true" size={13} />
        </Link>
      </span>
    </div>
  );
}
