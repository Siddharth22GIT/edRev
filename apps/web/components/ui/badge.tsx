import type { ReactNode } from "react";

type BadgeTone = "orange" | "blue" | "green" | "amber" | "red" | "slate" | "violet";

const tones: Record<BadgeTone, string> = {
  orange: "bg-[#FEF6EE] text-[#C27803] ring-[#FBD7B3]",
  blue: "bg-[#EFF6FC] text-[#2F659C] ring-[#C2DCF2]",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-800 ring-rose-200",
  slate: "bg-[#F7F7F6] text-[#30343B] ring-[#E6E6E6]",
  violet: "bg-purple-50 text-purple-800 ring-purple-200",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}
