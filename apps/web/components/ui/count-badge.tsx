import { countLabel } from "@/lib/dashboard-items";

const tones = {
  /** Red pill with white text (6.5:1): quick links. */
  alert: "bg-brand-alert text-white",
  /** Charcoal pill with white text: on an orange background (the current page in the rail). */
  dark: "bg-brand-text text-white",
  /** Orange pill with charcoal text (6.2:1): rail items on white. */
  orange: "bg-brand-orange text-brand-text",
};

/**
 * U6 / U10: a small count ("99+" above 99). The number is the text, so it never relies on colour alone,
 * and screen readers hear "N waiting" (or the given label).
 */
export function CountBadge({ count, tone = "alert", label, className = "" }: { count: number; tone?: keyof typeof tones; label?: string; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={`num inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold leading-none ${tones[tone]} ${className}`}>
      <span aria-hidden="true">{countLabel(count)}</span>
      <span className="sr-only">{label ?? `${count} waiting`}</span>
    </span>
  );
}
