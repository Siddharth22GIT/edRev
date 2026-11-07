import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { IconAlertTriangle, IconArrowRight } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { countLabel } from "@/lib/dashboard-items";

export interface TabCardProps {
  /** Shown on the orange tab that sits on the card's top border. Long titles are cut with "…" (full text on hover). */
  title: string;
  icon?: ReactNode;
  /** Optional number next to the title (e.g. unread), shown as "99+" above 99. */
  count?: number;
  /** Footer link ("View all"). */
  href?: string;
  viewAllLabel?: string;
  /** Small control at the top right (e.g. a primary action). */
  action?: ReactNode;
  loading?: boolean;
  /** A readable error. The card shows it with a Retry button instead of its content. */
  error?: string | null;
  onRetry?: () => void;
  /** No items: shows `emptyText` and `emptyAction` instead of the content. */
  empty?: boolean;
  emptyText?: string;
  emptyAction?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * U7: dashboard card with an orange tab label on its top border and an optional "View all" footer.
 * Loading, error and empty states are built in so every card handles them the same way.
 * Charcoal text on the orange tab (6.2:1 contrast), never white.
 */
export function TabCard({
  title,
  icon,
  count,
  href,
  viewAllLabel = "View all",
  action,
  loading = false,
  error = null,
  onRetry,
  empty = false,
  emptyText = "Nothing here yet.",
  emptyAction,
  className = "",
  children,
}: TabCardProps) {
  return (
    <section aria-busy={loading || undefined} className={`relative mt-3 flex flex-col rounded-card border border-brand-border bg-brand-card shadow-card ${className}`}>
      <div className="absolute -top-3 left-4 right-4 flex items-start justify-between gap-2">
        <h2
          className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md bg-brand-orange px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-brand-text shadow-sm ring-2 ring-brand-card"
          title={title}
        >
          {icon && (
            <span aria-hidden="true" className="shrink-0">
              {icon}
            </span>
          )}
          <span className="truncate">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="num shrink-0 rounded bg-brand-text px-1.5 text-[10px] leading-4 text-white">
              <span aria-hidden="true">{countLabel(count)}</span>
              <span className="sr-only">, {count} new</span>
            </span>
          )}
        </h2>
        {action && !loading && !error && <div className="shrink-0 rounded-md bg-brand-card px-1">{action}</div>}
      </div>

      <div className="flex-1 px-5 pb-4 pt-6">
        {loading ? (
          <div aria-label={`Loading ${title}`} className="space-y-3" role="status">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
            <p className="flex items-center gap-2">
              <IconAlertTriangle aria-hidden="true" size={16} />
              {error}
            </p>
            {onRetry && (
              <Button className="px-2.5 py-1 text-xs" onClick={onRetry} variant="secondary">
                Retry
              </Button>
            )}
          </div>
        ) : empty ? (
          <div className="py-2 text-sm text-brand-text-muted">
            <p>{emptyText}</p>
            {emptyAction && <div className="mt-3">{emptyAction}</div>}
          </div>
        ) : (
          children
        )}
      </div>

      {href && !error && (
        <Link
          className="flex items-center justify-between rounded-b-card border-t border-brand-border px-5 py-2.5 text-xs font-bold text-brand-blue transition hover:bg-brand-blue-light hover:text-brand-blue-hover"
          href={href}
        >
          <span>
            {viewAllLabel}
            <span className="sr-only">: {title}</span>
          </span>
          <IconArrowRight aria-hidden="true" size={14} />
        </Link>
      )}
    </section>
  );
}
