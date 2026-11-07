import Link from "next/link";
import type { ReactNode } from "react";
import { IconAlertTriangle, IconCheckCircle, IconClock } from "@/components/ui/icons";
import { DUE_LABELS, type DueState } from "@/lib/dashboard-items";

/** A compact list inside a TabCard. */
export function CardList({ children }: { children: ReactNode }) {
  return <ul className="-mx-2 divide-y divide-brand-border">{children}</ul>;
}

/** One linked row: title (cut with "…" when long), a muted line underneath, and something on the right. */
export function CardRow({ href, title, meta, aside, unread = false }: { href: string; title: string; meta?: ReactNode; aside?: ReactNode; unread?: boolean }) {
  return (
    <li>
      <Link className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-brand-bg" href={href}>
        {unread && (
          <span className="shrink-0 rounded bg-brand-blue px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
            New<span className="sr-only">:</span>
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm text-brand-text group-hover:text-brand-blue ${unread ? "font-extrabold" : "font-bold"}`} title={title}>
            {title}
          </span>
          {meta && <span className="mt-0.5 block truncate text-xs text-brand-text-muted">{meta}</span>}
        </span>
        {aside && <span className="shrink-0 text-right text-xs">{aside}</span>}
      </Link>
    </li>
  );
}

const dueStyles: Record<DueState, { chip: string; icon: ReactNode }> = {
  overdue: { chip: "bg-rose-50 text-rose-800 ring-rose-200", icon: <IconAlertTriangle size={12} /> },
  "at-risk": { chip: "bg-amber-50 text-amber-800 ring-amber-200", icon: <IconClock size={12} /> },
  soon: { chip: "bg-brand-blue-light text-brand-blue-dark ring-brand-blue-border", icon: <IconClock size={12} /> },
  later: { chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", icon: <IconCheckCircle size={12} /> },
};

/** U10: deadline status as text plus an icon, not colour alone. */
export function DueChip({ state }: { state: DueState }) {
  const style = dueStyles[state];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${style.chip}`}>
      <span aria-hidden="true">{style.icon}</span>
      {DUE_LABELS[state]}
    </span>
  );
}

/** A labelled number for card summaries (monospace digits, U1). */
export function Figure({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "muted" }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wide text-brand-text-muted">{label}</p>
      <p className={`num mt-0.5 truncate text-xl font-bold ${tone === "muted" ? "text-brand-text-muted" : "text-brand-text"}`}>{value}</p>
    </div>
  );
}
