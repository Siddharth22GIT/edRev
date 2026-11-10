import type { ReactNode } from "react";
import type { SlaState } from "@edurev/types";
import { SLA_STATE_LABELS } from "@edurev/types";
import { IconAlertTriangle, IconCheckCircle, IconClock } from "@/components/ui/icons";

// G9: the computed SLA state as a chip: text plus an icon, never colour alone (U10).

const styles: Record<SlaState, { chip: string; icon: ReactNode }> = {
  OVERDUE: { chip: "bg-rose-50 text-rose-800 ring-rose-200", icon: <IconAlertTriangle size={12} /> },
  AT_RISK: { chip: "bg-amber-50 text-amber-800 ring-amber-200", icon: <IconClock size={12} /> },
  PAUSED: { chip: "bg-slate-100 text-slate-700 ring-slate-300", icon: <IconClock size={12} /> },
  SUBMITTED: { chip: "bg-brand-blue-light text-brand-blue-dark ring-brand-blue-border", icon: <IconClock size={12} /> },
  NOT_STARTED: { chip: "bg-brand-orange-light text-brand-orange-dark ring-brand-orange-border", icon: <IconClock size={12} /> },
  ON_TRACK: { chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", icon: <IconCheckCircle size={12} /> },
  COMPLETED_ON_TIME: { chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", icon: <IconCheckCircle size={12} /> },
  COMPLETED_LATE: { chip: "bg-amber-50 text-amber-800 ring-amber-200", icon: <IconCheckCircle size={12} /> },
  CANCELLED: { chip: "bg-slate-100 text-slate-700 ring-slate-300", icon: <IconAlertTriangle size={12} /> },
};

export function SlaChip({ state, title }: { state: SlaState; title?: string }) {
  const style = styles[state] ?? styles.ON_TRACK;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${style.chip}`} title={title}>
      <span aria-hidden="true">{style.icon}</span>
      {SLA_STATE_LABELS[state]}
    </span>
  );
}
