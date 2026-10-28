import { TIER_INFO, type Tier } from "@edurev/types";

/**
 * Tier colours climb with the tier: TIER_1 neutral grey → TIER_2 blue → TIER_3 orange → TIER_4 dark brand
 * gradient with gold text. Use these everywhere a tier is shown so the scale reads the same across the app.
 */
export const TIER_STYLES: Record<Tier, { badge: string; bar: string; dot: string }> = {
  TIER_1: { badge: "bg-[#F7F7F6] text-[#666D7A] ring-[#E6E6E6]", bar: "bg-[#B8BDC6]", dot: "bg-[#8C93A0]" },
  TIER_2: { badge: "bg-[#EFF6FC] text-[#2F659C] ring-[#C2DCF2]", bar: "bg-[#3978B8]", dot: "bg-[#3978B8]" },
  TIER_3: { badge: "bg-[#FEF6EE] text-[#C27803] ring-[#FBD7B3]", bar: "bg-[#F2A65A]", dot: "bg-[#F2A65A]" },
  TIER_4: {
    badge: "bg-gradient-to-r from-[#30343B] to-[#204D7D] text-[#FBD7B3] ring-[#30343B]",
    bar: "bg-gradient-to-r from-[#30343B] to-[#204D7D]",
    dot: "bg-[#30343B]",
  },
};

export function TierBadge({
  tier,
  showName = true,
  prefix,
  suffix = "",
  className = "",
}: {
  tier: Tier;
  showName?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const style = TIER_STYLES[tier] ?? TIER_STYLES.TIER_1;
  const info = TIER_INFO[tier];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${style.badge} ${className}`}
      title={info ? `${tier.replace("_", " ")} · ${info.name}: ${info.description}` : tier}
    >
      {tier === "TIER_4" ? <span aria-hidden="true">★</span> : <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />}
      {prefix ? `${prefix} ` : ""}
      {tier.replace("_", " ")}
      {suffix}
      {showName && info ? <span className="font-semibold opacity-80">· {info.name}</span> : null}
    </span>
  );
}
