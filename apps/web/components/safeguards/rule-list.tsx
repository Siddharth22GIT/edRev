"use client";

import { useState } from "react";
import type { SafeguardRuleResult } from "@edurev/types";
import { Button } from "@/components/ui/button";
import { IconAlertTriangle, IconCheckCircle, IconClock, IconMessage } from "@/components/ui/icons";
import { roleLabels } from "@/lib/navigation";
import { useAction } from "@/lib/use-action";

// G6: every safeguard rule with its outcome, what's wrong, what unlocks it and who can help.
// Students get a "Request help" button on rules that block or warn them (one open request per rule).

const outcomeStyle = {
  BLOCK: { row: "border-rose-200 bg-rose-50/60", chip: "bg-rose-100 text-rose-800", icon: <IconAlertTriangle size={14} />, label: "Blocked" },
  WARN: { row: "border-amber-200 bg-amber-50/60", chip: "bg-amber-100 text-amber-800", icon: <IconClock size={14} />, label: "Heads-up" },
  PASS: { row: "border-brand-border bg-white", chip: "bg-emerald-50 text-emerald-800", icon: <IconCheckCircle size={14} />, label: "OK" },
} as const;

export function RuleList({
  rules,
  showPassed = false,
  canAskHelp = false,
  opportunityId,
  onHelpSent,
}: {
  rules: SafeguardRuleResult[];
  /** Also list rules that pass (collapsed behind a toggle by default). */
  showPassed?: boolean;
  canAskHelp?: boolean;
  opportunityId?: string;
  onHelpSent?: () => void;
}) {
  const [expanded, setExpanded] = useState(showPassed);
  const { run, busy } = useAction();
  const [asked, setAsked] = useState<Record<string, boolean>>({});
  const problems = rules.filter((r) => r.outcome !== "PASS");
  const passed = rules.filter((r) => r.outcome === "PASS");
  const visible = expanded ? [...problems, ...passed] : problems;

  const askHelp = async (rule: SafeguardRuleResult) => {
    const done = await run(`help-${rule.rule}`, "/help-requests", { body: { rule: rule.rule, ...(opportunityId ? { opportunityId } : {}) } });
    if (done) {
      setAsked((a) => ({ ...a, [rule.rule]: true }));
      onHelpSent?.();
    }
  };

  return (
    <div className="space-y-2">
      {problems.length === 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm font-semibold text-emerald-800">
          <IconCheckCircle size={16} /> Every safeguard is clear.
        </p>
      )}
      <ul className="space-y-2">
        {visible.map((r, i) => {
          const style = outcomeStyle[r.outcome];
          return (
            <li className={`rounded-lg border px-3 py-2.5 ${style.row}`} key={`${r.rule}-${i}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-brand-text">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${style.chip}`}>
                      <span aria-hidden="true">{style.icon}</span>
                      {style.label}
                    </span>
                    {r.label}
                    {r.outcome === "BLOCK" && <span className="text-[11px] font-semibold text-brand-text-muted">{r.hard ? "fixed rule" : "can be overridden by staff"}</span>}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-brand-text">{r.message}</p>
                  {r.unlock && r.outcome !== "PASS" && (
                    <p className="mt-0.5 text-xs leading-5 text-brand-text-muted">
                      <span className="font-semibold text-brand-text">How to unlock:</span> {r.unlock}
                      {r.helpFrom && <> · Who can help: {roleLabels[r.helpFrom]}</>}
                    </p>
                  )}
                </div>
                {canAskHelp && r.outcome !== "PASS" && r.label !== "Backlogs" && (
                  <Button className="!px-2.5 !py-1 text-xs" disabled={busy === `help-${r.rule}` || asked[r.rule]} onClick={() => askHelp(r)} variant="secondary">
                    <IconMessage size={13} />
                    {asked[r.rule] ? "Asked" : "Request help"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {passed.length > 0 && (
        <button className="text-xs font-bold text-brand-blue hover:underline" onClick={() => setExpanded((e) => !e)} type="button">
          {expanded ? "Hide the rules that pass" : `Show ${passed.length} rule${passed.length === 1 ? "" : "s"} that pass`}
        </button>
      )}
    </div>
  );
}
