"use client";

import { useEffect, useState } from "react";
import type { HourEntry, WeeklyCheckin, WeeklyHoursSummary } from "@edurev/types";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SkeletonRows } from "@/components/ui/skeleton";
import { TabCard } from "@/components/ui/tab-card";
import { IconClock, IconX } from "@/components/ui/icons";
import { useApi } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/format";
import { useAction } from "@/lib/use-action";
import { useResource } from "@/lib/use-resource";

// D10: "a student only gets work that fits inside their weekly hours". This card shows the week as the
// safeguards engine sees it (planned project hours + outside paid work vs the cap) and opens the Monday
// check-in, pre-filled with the plan. Going over the cap is recorded for the mentor; it never blocks current work.

interface WeekData {
  summary: WeeklyHoursSummary;
  weekStart: string;
  entries: HourEntry[];
  runningTimer: HourEntry | null;
}

export function MyWeekCard({ studentId }: { studentId: string }) {
  const week = useResource<WeekData>(`/hours/${studentId}/week`);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const s = week.data?.summary;
  const used = s ? Math.min(100, Math.round((s.usedHours / Math.max(1, s.cap)) * 100)) : 0;

  return (
    <>
      <TabCard
        action={
          <Button className="!px-2 !py-0.5 !text-[11px]" onClick={() => setCheckinOpen(true)} variant="primary">
            Check in
          </Button>
        }
        error={week.error}
        icon={<IconClock size={13} />}
        loading={week.loading}
        onRetry={week.retry}
        title="My week"
      >
        {s && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs text-brand-text-muted">
                Planned <span className="num text-lg font-bold text-brand-text">{s.usedHours} h</span> of <span className="nums">{s.cap} h</span>
              </p>
              <span className="text-[11px] font-semibold text-brand-text-muted">{s.capKind === "BREAK" ? "Break cap" : "Term cap"}</span>
            </div>
            <ProgressBar tone={s.usedHours > s.cap ? "red" : "orange"} value={used} />
            <ul className="space-y-1 text-xs text-brand-text-muted">
              {s.projects.map((p) => (
                <li className="flex justify-between gap-2" key={p.opportunityId}>
                  <span className="truncate">{p.title}</span>
                  <span className="nums shrink-0 font-semibold text-brand-text">{p.hoursPerWeek} h/wk</span>
                </li>
              ))}
              {s.otherPaidHours > 0 && (
                <li className="flex justify-between gap-2">
                  <span>Other paid work (last check-in)</span>
                  <span className="nums font-semibold text-brand-text">{s.otherPaidHours} h</span>
                </li>
              )}
              {s.projects.length === 0 && s.otherPaidHours === 0 && <li>No projects this week: your full {s.cap} h is free for new work.</li>}
            </ul>
            <p className="text-[11px] text-brand-text-muted">
              Recorded this week: <span className="nums font-semibold text-brand-text">{s.recordedHours ?? 0} h</span>
              {week.data?.runningTimer && <> · timer running since {timeAgo(week.data.runningTimer.startedAt!)}</>}
            </p>
          </div>
        )}
      </TabCard>
      {checkinOpen && <CheckinDialog onClose={() => setCheckinOpen(false)} onSaved={week.retry} studentId={studentId} />}
    </>
  );
}

interface CheckinView {
  weekStart: string;
  checkin: WeeklyCheckin | null;
  prefill: WeeklyCheckin;
  editable: boolean;
}

/** Monday of the week before `weekStart` / after it (YYYY-MM-DD). */
const shiftWeek = (weekStart: string, weeks: number) => new Date(Date.parse(`${weekStart}T00:00:00Z`) + weeks * 7 * 86_400_000).toISOString().slice(0, 10);

function CheckinDialog({ studentId, onClose, onSaved }: { studentId: string; onClose: () => void; onSaved: () => void }) {
  const { apiFetch } = useApi();
  const { run, busy } = useAction();
  const [week, setWeek] = useState<string | null>(null);
  const [view, setView] = useState<CheckinView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState<Record<string, number>>({});
  const [other, setOther] = useState(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    setView(null);
    setError(null);
    apiFetch(`/checkins/${studentId}${week ? `?week=${week}` : ""}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) return setError(json?.message || "Couldn't load the check-in.");
        const data = json.data as CheckinView;
        setView(data);
        const source = data.checkin ?? data.prefill;
        setHours(Object.fromEntries(source.projects.map((p) => [p.opportunityId, p.actualHours])));
        setOther(source.otherPaidHours ?? 0);
        setNote(source.note ?? "");
      })
      .catch(() => !cancelled && setError("Network error: is the API running?"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, week]);

  const lines = view ? (view.checkin ?? view.prefill).projects : [];
  const total = Math.round((Object.values(hours).reduce((a, b) => a + (Number(b) || 0), 0) + (Number(other) || 0)) * 10) / 10;
  const cap = view?.prefill.cap ?? 0;

  const save = async () => {
    if (!view) return;
    const json = await run("checkin", `/checkins/${studentId}/${view.weekStart}`, {
      method: "PUT",
      body: { projects: lines.map((l) => ({ opportunityId: l.opportunityId, actualHours: Number(hours[l.opportunityId]) || 0 })), otherPaidHours: Number(other) || 0, note },
    });
    if (json) {
      onSaved();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 !mt-0 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-white p-6 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-orange-dark">Weekly check-in</p>
            <h2 className="mt-0.5 text-lg font-bold text-brand-text" id="checkin-title">
              {view ? `Week of ${formatDate(view.weekStart)}` : "Loading…"}
            </h2>
          </div>
          <button aria-label="Close" className="rounded-lg p-1 text-brand-text-muted hover:bg-brand-bg" onClick={onClose} type="button">
            <IconX size={18} />
          </button>
        </div>
        {view && (
          <div className="mt-2 flex gap-3 text-xs">
            <button className="font-bold text-brand-blue hover:underline" onClick={() => setWeek(shiftWeek(view.weekStart, -1))} type="button">
              ← Earlier week
            </button>
            <button className="font-bold text-brand-blue hover:underline" onClick={() => setWeek(shiftWeek(view.weekStart, 1))} type="button">
              Later week →
            </button>
          </div>
        )}
        {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        {!view && !error && <SkeletonRows rows={3} />}
        {view && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-brand-text-muted">
              {view.checkin ? `Saved ${formatDate(view.checkin.submittedAt)}${view.checkin.source === "AUTO" ? " automatically with your planned hours" : ""}. You can correct it.` : "Pre-filled with your plan (and any timer hours). Correct the numbers to what really happened."}
            </p>
            {lines.map((l) => (
              <label className="flex items-center justify-between gap-3 text-sm" key={l.opportunityId}>
                <span className="min-w-0 truncate font-semibold text-brand-text">
                  {l.title} <span className="text-xs font-normal text-brand-text-muted">(planned {l.plannedHours} h)</span>
                </span>
                <input
                  className="w-20 rounded-lg border border-brand-border px-2 py-1.5 text-right text-sm"
                  disabled={!view.editable}
                  max={80}
                  min={0}
                  onChange={(e) => setHours((h) => ({ ...h, [l.opportunityId]: Number(e.target.value) }))}
                  step={0.5}
                  type="number"
                  value={hours[l.opportunityId] ?? 0}
                />
              </label>
            ))}
            {lines.length === 0 && <p className="text-xs text-brand-text-muted">No allocated projects that week.</p>}
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-brand-text">
                Other paid work <span className="text-xs font-normal text-brand-text-muted">(Upwork, Fiverr…, counts toward the cap)</span>
              </span>
              <input className="w-20 rounded-lg border border-brand-border px-2 py-1.5 text-right text-sm" disabled={!view.editable} max={80} min={0} onChange={(e) => setOther(Number(e.target.value))} step={0.5} type="number" value={other} />
            </label>
            <textarea className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm" disabled={!view.editable} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Anything your mentor should know (optional)" rows={2} value={note} />
            <p className={`text-sm font-bold ${total > cap ? "text-rose-700" : "text-brand-text"}`}>
              Total <span className="nums">{total} h</span> of <span className="nums">{cap} h</span>
              {total > cap && <span className="block text-xs font-normal text-rose-700">Over the cap: your mentor will see this. Your current projects carry on; nothing is blocked.</span>}
            </p>
            {!view.editable && <p className="text-xs text-brand-text-muted">This week can't be changed (future weeks, or more than 4 weeks ago).</p>}
            <div className="flex justify-end gap-2">
              <Button onClick={onClose} variant="ghost">
                Cancel
              </Button>
              <Button disabled={!view.editable || busy === "checkin"} onClick={save} variant="primary">
                Save check-in
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
