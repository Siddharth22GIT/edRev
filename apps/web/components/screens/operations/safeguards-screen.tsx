"use client";

import { useState } from "react";
import Link from "next/link";
import {
  can,
  SAFEGUARD_RULES,
  SIGNUP_PROGRAMS,
  type BlackoutPeriod,
  type HelpRequest,
  type Safeguard,
  type SafeguardCheck,
  type SafeguardLimits,
} from "@edurev/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { TabCard } from "@/components/ui/tab-card";
import { IconCalendar, IconMessage, IconSafeguards, IconShield } from "@/components/ui/icons";
import { MyWeekCard } from "@/components/hours/my-week-card";
import { RuleList } from "@/components/safeguards/rule-list";
import { useAuth } from "@/lib/auth-context";
import { formatDate, timeAgo } from "@/lib/format";
import { roleLabels } from "@/lib/navigation";
import { useAction } from "@/lib/use-action";
import { useResource } from "@/lib/use-resource";

// Phase 4 (F1, G1–G7): the Safeguards page on live data. Students see their own rules (with "Request help"),
// their week and their help requests. Staff see how many students each rule blocks right now (G7), the limits
// (G1) and the exam blackouts (G4). Doc: docs/modules/safeguards.md

export function SafeguardsScreen() {
  const { user } = useAuth();
  const isStudent = user?.role === "STUDENT";
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Academic safeguards"
        title={isStudent ? "My safeguards" : "Safeguards"}
        description={
          isStudent
            ? "Studies come first. These checks decide whether new work can be allocated to you right now, what unlocks each one and who can help."
            : "The checks that run before any allocation: academics, attendance, exams, weekly hours, projects at once and reliability. Counts are worked out from live records."
        }
      />
      {isStudent ? <StudentView studentId={user!.studentId || user!.id} /> : <StaffView />}
    </div>
  );
}

/* ---------------- student ---------------- */

function StudentView({ studentId }: { studentId: string }) {
  const check = useResource<SafeguardCheck>(`/safeguards/${studentId}`);
  const help = useResource<HelpRequest[]>("/help-requests");
  const blackouts = useResource<BlackoutPeriod[]>("/blackouts");
  const upcoming = (blackouts.data ?? []).filter((b) => b.endDate >= new Date().toISOString().slice(0, 10));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="space-y-4 p-6 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold text-brand-text">
            <IconShield size={16} /> Can new work be allocated to me?
          </h2>
          {check.data && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${check.data.eligible ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
              {check.data.eligible ? "Yes" : "Not right now"}
            </span>
          )}
        </div>
        {check.loading ? <SkeletonRows rows={3} /> : check.error ? <p className="text-sm text-rose-800">{check.error}</p> : check.data?.rules && <RuleList canAskHelp onHelpSent={help.retry} rules={check.data.rules} />}
        <p className="text-[11px] text-brand-text-muted">
          Each opportunity page also checks that specific work (its tier, its weekly hours and any exams inside its dates) before you bid.
        </p>
      </Card>

      <div className="space-y-6">
        <MyWeekCard studentId={studentId} />
        <TabCard
          empty={(help.data ?? []).length === 0}
          emptyText="You haven't asked for help. Use “Request help” on any rule that blocks you."
          error={help.error}
          href="/messages"
          icon={<IconMessage size={13} />}
          loading={help.loading}
          onRetry={help.retry}
          title="My help requests"
          viewAllLabel="Messages"
        >
          <ul className="space-y-2 text-xs">
            {(help.data ?? []).slice(0, 5).map((r) => (
              <li className="rounded-lg border border-brand-border px-3 py-2" key={r.id}>
                <Link className="font-bold text-brand-text hover:text-brand-blue" href={`/messages?c=${r.conversationId}`}>
                  {SAFEGUARD_RULES[r.rule]?.label ?? r.rule}
                </Link>
                <p className="text-brand-text-muted">
                  {r.status === "OPEN" ? `With ${r.routedUserName} (${roleLabels[r.routedRole]}) · asked ${timeAgo(r.createdAt)}` : `Resolved: ${r.outcome}`}
                </p>
              </li>
            ))}
          </ul>
        </TabCard>
        <TabCard empty={upcoming.length === 0} emptyText="No exam blackouts coming up." error={blackouts.error} icon={<IconCalendar size={13} />} loading={blackouts.loading} onRetry={blackouts.retry} title="Exam blackouts">
          <ul className="space-y-1.5 text-xs">
            {upcoming.map((b) => (
              <li key={b.id}>
                <span className="font-bold text-brand-text">{b.title}</span> · <span className="nums">{formatDate(b.startDate)}</span> to <span className="nums">{formatDate(b.endDate)}</span>
              </li>
            ))}
          </ul>
        </TabCard>
      </div>
    </div>
  );
}

/* ---------------- staff ---------------- */

function StaffView() {
  const { user } = useAuth();
  const role = user!.role;
  const { run, busy } = useAction();
  const [version, setVersion] = useState(0);
  const health = useResource<{ data: Safeguard[]; lastDailyRun: { lastRunAt: string } | null }>(`/safeguards?v=${version}`, (json) => json);
  const limits = useResource<SafeguardLimits>("/safeguards/limits");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-brand-text-muted">
        <span>
          Daily checks (reminders, missed check-ins, help escalation) last ran:{" "}
          <span className="font-semibold text-brand-text">{health.data?.lastDailyRun ? timeAgo(health.data.lastDailyRun.lastRunAt) : "not yet"}</span>
        </span>
        {can(role, "SETTINGS_MANAGE") && (
          <Button
            className="text-xs"
            disabled={busy === "run"}
            onClick={async () => {
              if (await run("run", "/sla/run-checks", { success: "Checks finished." })) setVersion((v) => v + 1);
            }}
            variant="secondary"
          >
            Run checks now
          </Button>
        )}
      </div>

      {health.loading ? (
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      ) : health.error ? (
        <Card className="p-5 text-sm text-rose-800">{health.error}</Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {(health.data?.data ?? []).map((card) => (
            <Card className="flex flex-col justify-between p-5" key={card.id}>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-brand-text">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-blue-border bg-brand-blue-light text-brand-blue">
                      <IconSafeguards size={14} />
                    </span>
                    {card.name}
                  </h2>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-brand-text-muted">{card.hard ? "Fixed" : "Overridable"}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-brand-text-muted">{card.description}</p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-brand-border pt-3 text-xs">
                <div>
                  <dt className="text-brand-text-muted">Blocked</dt>
                  <dd className={`num text-lg font-bold ${card.blockedCount ? "text-rose-700" : "text-brand-text"}`}>{card.blockedCount ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-brand-text-muted">Warned</dt>
                  <dd className={`num text-lg font-bold ${card.warnedCount ? "text-amber-700" : "text-brand-text"}`}>{card.warnedCount ?? 0}</dd>
                </div>
                <div className="col-span-2 text-[11px] text-brand-text-muted">
                  Owner: <span className="font-semibold text-brand-text">{card.owner}</span> · of {card.checkedStudents ?? 0} active students
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <LimitsCard limits={limits.data} loading={limits.loading} canEdit={can(role, "SETTINGS_MANAGE")} />
        <BlackoutsCard canManage={can(role, "BLACKOUT_MANAGE")} />
      </div>
    </div>
  );
}

function LimitsCard({ limits, loading, canEdit }: { limits: SafeguardLimits | null; loading: boolean; canEdit: boolean }) {
  return (
    <TabCard action={canEdit ? <Link className="text-[11px] font-bold text-brand-blue hover:underline" href="/settings#safeguard-limits">Edit</Link> : undefined} icon={<IconShield size={13} />} loading={loading} title="Limits in force">
      {limits && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Limit label="Weekly hours (term / break)" value={`${limits.termHoursCap} h / ${limits.breakHoursCap} h`} />
          <Limit label="Minimum attendance" value={`${limits.attendanceMin}%`} />
          <Limit label="Projects at once (T1–T4)" value={`${limits.parallelProjects.TIER_1} · ${limits.parallelProjects.TIER_2} · ${limits.parallelProjects.TIER_3} · ${limits.parallelProjects.TIER_4}`} />
          <Limit label="Extensions" value={`${limits.extensionMaxPerProject} per project, ≤ ${limits.extensionMaxPercent}%`} />
          <Limit label="Cool-down" value={`${limits.cooldownOverdueCount} overdue in ${limits.cooldownWindowDays} d → ${limits.cooldownDays} d`} />
          <Limit label="Stop before exams" value={`${limits.blackoutBufferDays} day${limits.blackoutBufferDays === 1 ? "" : "s"}`} />
          <Limit label="Kick-off within" value={`${limits.kickoffHours} h`} />
          <Limit label="Revisions included" value={String(limits.revisionRounds)} />
          <Limit label="Break periods" value={limits.breakPeriods.length ? limits.breakPeriods.map((b) => b.title).join(", ") : "none set (term cap all year)"} />
        </dl>
      )}
    </TabCard>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-brand-text-muted">{label}</dt>
      <dd className="nums font-bold text-brand-text">{value}</dd>
    </div>
  );
}

function BlackoutsCard({ canManage }: { canManage: boolean }) {
  const [version, setVersion] = useState(0);
  const list = useResource<BlackoutPeriod[]>(`/blackouts?v=${version}`);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ title: "", startDate: "", endDate: "", program: "" });
  const refresh = () => setVersion((v) => v + 1);

  return (
    <TabCard empty={(list.data ?? []).length === 0 && !canManage} emptyText="No exam blackouts." error={list.error} icon={<IconCalendar size={13} />} loading={list.loading} onRetry={list.retry} title="Exam blackouts">
      <ul className="space-y-1.5 text-xs">
        {(list.data ?? []).map((b) => (
          <li className="flex items-center justify-between gap-2 rounded-lg border border-brand-border px-3 py-2" key={b.id}>
            <span>
              <span className="font-bold text-brand-text">{b.title}</span> · <span className="nums">{formatDate(b.startDate)}</span> to <span className="nums">{formatDate(b.endDate)}</span>
              <span className="block text-brand-text-muted">{b.programs?.length ? b.programs.join(", ") : "All programmes"}{b.years?.length ? ` · Year ${b.years.join(", ")}` : ""}</span>
            </span>
            {canManage && (
              <Button className="!px-2 !py-1 text-[11px]" disabled={busy === b.id} onClick={async () => (await run(b.id, `/blackouts/${b.id}`, { method: "DELETE" })) && refresh()} variant="ghost">
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = { title: form.title, startDate: form.startDate, endDate: form.endDate, ...(form.program ? { programs: [form.program] } : {}) };
            if (await run("add-blackout", "/blackouts", { body })) {
              setForm({ title: "", startDate: "", endDate: "", program: "" });
              refresh();
            }
          }}
        >
          <input aria-label="Title" className="rounded-lg border border-brand-border px-3 py-2 text-xs sm:col-span-2" onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title, e.g. End-semester exams" value={form.title} />
          <label className="text-[11px] text-brand-text-muted">
            Starts
            <input className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-xs" onChange={(e) => setForm({ ...form, startDate: e.target.value })} type="date" value={form.startDate} />
          </label>
          <label className="text-[11px] text-brand-text-muted">
            Ends
            <input className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2 text-xs" onChange={(e) => setForm({ ...form, endDate: e.target.value })} type="date" value={form.endDate} />
          </label>
          <select aria-label="Programme" className="rounded-lg border border-brand-border px-3 py-2 text-xs" onChange={(e) => setForm({ ...form, program: e.target.value })} value={form.program}>
            <option value="">All programmes</option>
            {SIGNUP_PROGRAMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <Button className="text-xs" disabled={busy === "add-blackout" || !form.title || !form.startDate || !form.endDate} type="submit" variant="primary">
            Add blackout
          </Button>
        </form>
      )}
    </TabCard>
  );
}
