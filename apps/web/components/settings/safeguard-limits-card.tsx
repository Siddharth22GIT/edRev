"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SAFEGUARD_LIMITS, SAFEGUARD_LIMIT_RANGES, type DateRange, type SafeguardLimits, type Tier } from "@edurev/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonRows } from "@/components/ui/skeleton";
import { IconShield } from "@/components/ui/icons";
import { useAction } from "@/lib/use-action";
import { useResource } from "@/lib/use-resource";

// G1: an Administrator edits the safeguard limits (decisions D1–D5). The server refuses anything out of range;
// the inputs carry the same ranges so mistakes are caught early. Doc: docs/modules/safeguards.md §3

type NumberKey = keyof typeof SAFEGUARD_LIMIT_RANGES;

const GROUPS: { title: string; fields: [NumberKey, string, string?][] }[] = [
  { title: "Weekly hours (D1)", fields: [["termHoursCap", "Term cap", "h/week"], ["breakHoursCap", "Break cap", "h/week"]] },
  { title: "Academics (D2)", fields: [["attendanceMin", "Minimum attendance", "%"], ["blackoutBufferDays", "Stop new work before exams", "days"]] },
  { title: "Extensions (D4)", fields: [["extensionMaxPerProject", "Per project"], ["extensionMaxPercent", "At most", "% of the time"]] },
  { title: "Reliability cool-down (D5)", fields: [["cooldownOverdueCount", "Overdue projects"], ["cooldownWindowDays", "Within", "days"], ["cooldownDays", "Pause new work for", "days"]] },
  { title: "Delivery", fields: [["kickoffHours", "Kick off within", "hours"], ["revisionRounds", "Revisions included"]] },
  { title: "Service levels (working days)", fields: [["signupReviewDays", "Approve sign-ups within"], ["earningVerifyDays", "Verify earnings within"], ["helpReplyWorkingDays", "Reply to help within"], ["helpEscalateWorkingDays", "Escalate help after"]] },
];
const TIERS: Tier[] = ["TIER_1", "TIER_2", "TIER_3", "TIER_4"];
const field = "mt-1 w-full rounded-lg border border-brand-border bg-white px-3 py-2 text-sm text-brand-text focus:border-brand-blue focus:outline-none";

export function SafeguardLimitsCard() {
  const limits = useResource<SafeguardLimits>("/safeguards/limits");
  const { run, busy } = useAction();
  const [form, setForm] = useState<SafeguardLimits | null>(null);

  useEffect(() => {
    if (limits.data) setForm(structuredClone(limits.data));
  }, [limits.data]);

  if (limits.loading || !form) {
    return (
      <Card id="safeguard-limits">
        <SkeletonRows rows={4} />
      </Card>
    );
  }

  const setNumber = (key: NumberKey, value: string) => setForm({ ...form, [key]: value === "" ? ("" as unknown as number) : Number(value) });
  const setBreak = (i: number, patch: Partial<DateRange>) => setForm({ ...form, breakPeriods: form.breakPeriods.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  return (
    <Card className="space-y-6 p-6" id="safeguard-limits">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-brand-text">
          <IconShield size={16} /> Safeguard limits
        </h2>
        <p className="mt-1 text-xs text-brand-text-muted">Changes apply to the next check, for every student. Current projects are never cancelled by a change.</p>
      </div>

      {GROUPS.map((group) => (
        <fieldset className="space-y-2" key={group.title}>
          <legend className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">{group.title}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {group.fields.map(([key, label, unit]) => {
              const [min, max] = SAFEGUARD_LIMIT_RANGES[key];
              return (
                <label className="text-xs text-brand-text-muted" key={key}>
                  {label}
                  {unit && <span className="text-[11px]"> ({unit})</span>}
                  <input className={field} max={max} min={min} onChange={(e) => setNumber(key, e.target.value)} type="number" value={form[key] as number} />
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <fieldset className="space-y-2">
        <legend className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Projects at once, by tier (D3)</legend>
        <div className="grid grid-cols-4 gap-3">
          {TIERS.map((t) => (
            <label className="text-xs text-brand-text-muted" key={t}>
              {t.replace("_", " ")}
              <input className={field} max={10} min={1} onChange={(e) => setForm({ ...form, parallelProjects: { ...form.parallelProjects, [t]: Number(e.target.value) } })} type="number" value={form.parallelProjects[t]} />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Break periods (the break cap applies)</legend>
        {form.breakPeriods.map((b, i) => (
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2" key={b.id}>
            <input aria-label="Break title" className={field} onChange={(e) => setBreak(i, { title: e.target.value })} value={b.title} />
            <input aria-label="Starts" className={field} onChange={(e) => setBreak(i, { startDate: e.target.value })} type="date" value={b.startDate} />
            <input aria-label="Ends" className={field} onChange={(e) => setBreak(i, { endDate: e.target.value })} type="date" value={b.endDate} />
            <Button onClick={() => setForm({ ...form, breakPeriods: form.breakPeriods.filter((_, j) => j !== i) })} variant="ghost">
              Remove
            </Button>
          </div>
        ))}
        <button
          className="text-xs font-bold text-brand-blue hover:underline"
          onClick={() => setForm({ ...form, breakPeriods: [...form.breakPeriods, { id: `new-${Date.now()}`, title: "Winter break", startDate: "", endDate: "" }] })}
          type="button"
        >
          + Add a break period
        </button>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy === "limits"}
          onClick={async () => {
            const json = await run<{ data: SafeguardLimits }>("limits", "/safeguards/limits", { method: "PUT", body: form });
            if (json?.data) setForm(structuredClone(json.data));
          }}
          variant="primary"
        >
          Save limits
        </Button>
        <Button onClick={() => setForm(structuredClone({ ...DEFAULT_SAFEGUARD_LIMITS, breakPeriods: form.breakPeriods }))} variant="secondary">
          Reset to the agreed defaults
        </Button>
      </div>
    </Card>
  );
}
