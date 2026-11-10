"use client";

import { useState } from "react";
import { can, isHardRule, SAFEGUARD_RULES, type AcademicSnapshot, type SafeguardCheck, type SafeguardOverride, type SafeguardRuleId } from "@edurev/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonRows } from "@/components/ui/skeleton";
import { IconShield } from "@/components/ui/icons";
import { RuleList } from "@/components/safeguards/rule-list";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/format";
import { useAction } from "@/lib/use-action";
import { useResource } from "@/lib/use-resource";

// Phase 4 (G3, G5, G6) on a student's record, for staff: every rule with its outcome; overrides of soft rules
// (SAFEGUARD_OVERRIDE, with a reason and an expiry, logged and revocable); attendance, backlogs and compliance
// (ACADEMIC_RECORD_MANAGE). Doc: docs/modules/safeguards.md

const SOFT_RULES = (Object.keys(SAFEGUARD_RULES) as SafeguardRuleId[]).filter((r) => !isHardRule(r));
const field = "w-full rounded-lg border border-brand-border bg-white px-3 py-2 text-sm";

export function StudentSafeguardsPanel({ studentId, academic, onChanged }: { studentId: string; academic: AcademicSnapshot | null; onChanged?: () => void }) {
  const { user } = useAuth();
  const role = user!.role;
  const [version, setVersion] = useState(0);
  const check = useResource<SafeguardCheck>(`/safeguards/${studentId}?v=${version}`);
  const overrides = useResource<SafeguardOverride[]>(`/safeguards/${studentId}/overrides?v=${version}`);
  const { run, busy } = useAction();
  const refresh = () => {
    setVersion((v) => v + 1);
    onChanged?.();
  };

  const [ovr, setOvr] = useState({ rule: "HOURS" as SafeguardRuleId, reason: "", days: 7 });
  const [comp, setComp] = useState({
    attendance: academic?.attendancePercent?.toString() ?? "",
    backlogs: academic?.activeBacklogs?.toString() ?? "",
    status: academic?.complianceStatus ?? "COMPLIANT",
    note: academic?.complianceNote ?? "",
  });
  const now = Date.now();

  return (
    <Card className="space-y-6 p-6" id="safeguards">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-brand-text">
          <IconShield size={16} /> Safeguards
        </h2>
        {check.data && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${check.data.eligible ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
            {check.data.eligible ? "Can be allocated work" : "Blocked for new work"}
          </span>
        )}
      </div>

      {check.loading ? <SkeletonRows rows={3} /> : check.data?.rules && <RuleList rules={check.data.rules} />}
      {check.data?.hours && (
        <p className="text-xs text-brand-text-muted">
          This week: <span className="nums font-bold text-brand-text">{check.data.hours.usedHours} h</span> planned of the <span className="nums">{check.data.hours.cap} h</span> {check.data.hours.capKind === "BREAK" ? "break" : "term"} cap · recorded{" "}
          <span className="nums">{check.data.hours.recordedHours ?? 0} h</span>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Overrides (soft rules only)</h3>
          <ul className="space-y-1.5 text-xs">
            {(overrides.data ?? []).map((o) => {
              const active = !o.revokedAt && Date.parse(o.expiresAt) > now;
              return (
                <li className="flex items-start justify-between gap-2 rounded-lg border border-brand-border px-3 py-2" key={o.id}>
                  <span>
                    <span className="font-bold text-brand-text">{SAFEGUARD_RULES[o.rule]?.label ?? o.rule}</span> · {o.reason}
                    <span className="block text-brand-text-muted">
                      by {o.createdBy} · {o.revokedAt ? `ended ${formatDate(o.revokedAt)}` : active ? `until ${formatDate(o.expiresAt)}` : `expired ${formatDate(o.expiresAt)}`}
                    </span>
                  </span>
                  {active && can(role, "SAFEGUARD_OVERRIDE") && (
                    <Button className="!px-2 !py-1 text-[11px]" disabled={busy === o.id} onClick={async () => (await run(o.id, `/safeguards/overrides/${o.id}/revoke`)) && refresh()} variant="ghost">
                      End now
                    </Button>
                  )}
                </li>
              );
            })}
            {(overrides.data ?? []).length === 0 && <li className="text-brand-text-muted">No overrides.</li>}
          </ul>
          {can(role, "SAFEGUARD_OVERRIDE") && (
            <form
              className="space-y-2 rounded-lg border border-dashed border-brand-border p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run("override", "/safeguards/overrides", { body: { studentId, rule: ovr.rule, reason: ovr.reason.trim(), days: ovr.days } })) {
                  setOvr({ ...ovr, reason: "" });
                  refresh();
                }
              }}
            >
              <div className="grid grid-cols-3 gap-2">
                <select aria-label="Rule" className={`${field} col-span-2`} onChange={(e) => setOvr({ ...ovr, rule: e.target.value as SafeguardRuleId })} value={ovr.rule}>
                  {SOFT_RULES.map((r) => (
                    <option key={r} value={r}>
                      {SAFEGUARD_RULES[r].label}
                    </option>
                  ))}
                </select>
                <label className="text-[11px] text-brand-text-muted">
                  <span className="sr-only">Days</span>
                  <input aria-label="Days" className={field} max={30} min={1} onChange={(e) => setOvr({ ...ovr, days: Number(e.target.value) })} type="number" value={ovr.days} />
                </label>
              </div>
              <input aria-label="Reason" className={field} maxLength={300} onChange={(e) => setOvr({ ...ovr, reason: e.target.value })} placeholder="Reason (logged), e.g. documented medical leave" value={ovr.reason} />
              <Button className="text-xs" disabled={busy === "override" || ovr.reason.trim().length < 5} type="submit" variant="primary">
                Override for {ovr.days} day{ovr.days === 1 ? "" : "s"}
              </Button>
              <p className="text-[11px] text-brand-text-muted">Tier, CGPA, exam blackout and projects-at-once are fixed rules and can&apos;t be overridden.</p>
            </form>
          )}
        </section>

        {can(role, "ACADEMIC_RECORD_MANAGE") && (
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Attendance &amp; compliance</h3>
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const body: Record<string, unknown> = { complianceStatus: comp.status, note: comp.note };
                body.attendancePercent = comp.attendance === "" ? null : Number(comp.attendance);
                body.activeBacklogs = comp.backlogs === "" ? null : Number(comp.backlogs);
                if (await run("compliance", `/academic/${studentId}/compliance`, { method: "PUT", body })) refresh();
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-brand-text-muted">
                  Attendance %
                  <input className={`${field} mt-1`} max={100} min={0} onChange={(e) => setComp({ ...comp, attendance: e.target.value })} placeholder="not recorded" step={0.1} type="number" value={comp.attendance} />
                </label>
                <label className="text-[11px] text-brand-text-muted">
                  Active backlogs
                  <input className={`${field} mt-1`} max={50} min={0} onChange={(e) => setComp({ ...comp, backlogs: e.target.value })} placeholder="not recorded" type="number" value={comp.backlogs} />
                </label>
              </div>
              <label className="block text-[11px] text-brand-text-muted">
                Compliance
                <select className={`${field} mt-1`} onChange={(e) => setComp({ ...comp, status: e.target.value as typeof comp.status })} value={comp.status}>
                  <option value="COMPLIANT">Complete</option>
                  <option value="WARNING">Needs attention (warning)</option>
                  <option value="NON_COMPLIANT">Incomplete (blocks new work)</option>
                </select>
              </label>
              <input aria-label="Compliance note" className={field} maxLength={300} onChange={(e) => setComp({ ...comp, note: e.target.value })} placeholder="Note (optional), e.g. conduct form pending" value={comp.note} />
              <Button className="text-xs" disabled={busy === "compliance"} type="submit" variant="primary">
                Save
              </Button>
              {academic?.complianceUpdatedBy && (
                <p className="text-[11px] text-brand-text-muted">
                  Last updated by {academic.complianceUpdatedBy}
                  {academic.complianceUpdatedAt && <> on {formatDate(academic.complianceUpdatedAt)}</>}.
                </p>
              )}
            </form>
          </section>
        )}
      </div>
    </Card>
  );
}
