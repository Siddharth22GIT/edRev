import type { ReactNode } from "react";
import { Card } from "./card";

interface StatCardProps {
  label: string;
  value: string;
  detail: string;
  trend?: "positive" | "neutral" | "attention";
  icon?: ReactNode;
  accent?: "orange" | "blue" | "emerald" | "amber";
}

const trendClasses = {
  positive: "text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200",
  neutral: "text-[#666D7A] bg-[#F7F7F6] ring-1 ring-[#E6E6E6]",
  attention: "text-amber-800 bg-amber-50 ring-1 ring-amber-200",
};

const iconAccents = {
  orange: "bg-[#FEF6EE] text-[#C27803] border-[#FBD7B3]",
  blue: "bg-[#EFF6FC] text-[#2F659C] border-[#C2DCF2]",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
};

export function StatCard({ label, value, detail, trend = "neutral", icon, accent = "orange" }: StatCardProps) {
  return (
    <Card className="p-5 hover:border-[#D1D5DB] hover:shadow-cardHover transition-all">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#666D7A]">{label}</p>
        {icon && (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${iconAccents[accent]}`}>
            {icon}
          </div>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[#30343B] sm:text-3xl">{value}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${trendClasses[trend]}`}>
          {detail}
        </span>
      </div>
    </Card>
  );
}
