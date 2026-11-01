/** Shimmering placeholder shown while data loads (instead of flashing sample data). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-lg ${className}`} />;
}

/** A few stacked placeholder rows for lists and tables. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-label="Loading" className="space-y-3 p-5" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div className="flex items-center gap-3" key={i}>
          <Skeleton className="h-9 w-9 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
