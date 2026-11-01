import { TIER_INFO, TIER_ORDER, tierRankOf, type Tier, type TierCriterion } from "@edurev/types";
import { TIER_STYLES } from "@/components/ui/tier-badge";

/** The four tiers as a ladder, lowest to highest, in the tier colour scale. Reached tiers are filled in. */
export function TierLadder({ current }: { current: Tier }) {
  const currentRank = tierRankOf(current);
  return (
    <ol className="grid grid-cols-4 gap-2">
      {TIER_ORDER.map((tier) => {
        const rank = tierRankOf(tier);
        const reached = rank <= currentRank;
        const isCurrent = tier === current;
        return (
          <li className="flex flex-col items-center text-center" key={tier}>
            <div
              className={`flex w-full flex-col items-center justify-end rounded-xl px-2 pb-2 pt-3 transition ${reached ? TIER_STYLES[tier].bar : "bg-[#F1EFEC]"} ${
                isCurrent ? "ring-4 ring-[#FBD7B3]" : ""
              }`}
              style={{ height: 36 + rank * 18 }}
            >
              <span className={`text-xs font-extrabold ${reached ? (tier === "TIER_1" ? "text-[#30343B]" : "text-white") : "text-[#8C93A0]"}`}>
                {tier === "TIER_4" ? "★ " : ""}
                {tier.replace("_", " ")}
              </span>
            </div>
            <span className={`mt-1.5 text-[11px] font-bold ${isCurrent ? "text-[#C27803]" : "text-[#666D7A]"}`}>{TIER_INFO[tier].name}</span>
            {isCurrent && <span className="text-[10px] font-semibold text-[#8C93A0]">You are here</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** A tick-list of the criteria for a tier. */
export function CriteriaList({ criteria }: { criteria: TierCriterion[] }) {
  return (
    <ul className="space-y-2">
      {criteria.map((c) => (
        <li className="flex items-center gap-3 rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/50 px-4 py-3" key={c.label}>
          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${c.met ? "bg-emerald-100 text-emerald-700" : "bg-[#E6E6E6] text-[#666D7A]"}`}>
            {c.met ? "✓" : "·"}
          </span>
          <span className={c.met ? "text-xs font-semibold text-[#30343B]" : "text-xs text-[#666D7A]"}>{c.label}</span>
        </li>
      ))}
    </ul>
  );
}
