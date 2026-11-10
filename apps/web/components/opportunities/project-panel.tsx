"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { can, type Allocation, type HourEntry, type Opportunity, type SlaEvent, type SlaView } from "@edurev/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SkeletonRows } from "@/components/ui/skeleton";
import { IconCalendar, IconCheckCircle, IconClock, IconExternalLink, IconFileText, IconSend } from "@/components/ui/icons";
import { SlaChip } from "@/components/safeguards/sla-chip";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { celebrate } from "@/lib/celebrate";
import { formatDate, timeAgo } from "@/lib/format";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/lib/toast";

// Phase 4 (F2, G9, G10, G12): allocated work on the opportunity page. The allocated student kicks off, ticks
// milestones, runs the timer, submits, asks for an extension or hands the work back. Staff accept or ask for a
// revision; Cell Coordinators and Administrators decide extensions, pause, resume or cancel. Every button
// follows the same PERMISSIONS the API enforces. Doc: docs/modules/sla-and-delivery.md

type AllocationWithSla = Allocation & { sla?: SlaView };

const MAX_PDF_BYTES = 10 * 1024 * 1024;

const EVENT_LABELS: Record<string, string> = {
  ALLOCATED: "Allocated",
  KICKOFF: "Kicked off",
  MILESTONE_DONE: "Milestone done",
  SUBMITTED: "Work submitted",
  ACCEPTED: "Accepted",
  REVISION_REQUESTED: "Revision requested",
  EXTENSION_REQUESTED: "Extension requested",
  EXTENSION_APPROVED: "Extension approved",
  EXTENSION_REJECTED: "Extension refused",
  PAUSED: "Paused",
  RESUMED: "Resumed",
  HAND_BACK_REQUESTED: "Asked to hand back",
  CANCELLED: "Cancelled",
  REASSIGNED: "Reassigned",
  REMINDER_48H: "Reminder: due in 2 days",
  REMINDER_24H: "Reminder: due within 24 hours",
  REMINDER_AT_RISK: "Reminder: at risk",
  REMINDER_OVERDUE: "Reminder: overdue",
  REMINDER_KICKOFF: "Reminder: kick off",
};

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-brand-border pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const inputClass = "w-full rounded-lg border border-brand-border bg-white px-3 py-2 text-sm text-brand-text focus:border-brand-blue focus:outline-none";

export function ProjectPanel({ opportunity }: { opportunity: Opportunity }) {
  const { user } = useAuth();
  const { apiFetch, fetchBlobUrl } = useApi();
  const { toast } = useToast();
  const { run, busy } = useAction();
  const [allocation, setAllocation] = useState<AllocationWithSla | null>(null);
  const [events, setEvents] = useState<SlaEvent[]>([]);
  const [timer, setTimer] = useState<HourEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTimeline, setShowTimeline] = useState(false);

  const role = user!.role;
  const me = user!.studentId || user!.id;
  const isOwner = role === "STUDENT" && allocation?.studentId === me;
  const canReview = can(role, "OPPORTUNITY_ALLOCATE");
  const canManage = can(role, "SLA_MANAGE");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/opportunities/${opportunity.id}/allocation`);
      const data = (await res.json().catch(() => null))?.data as AllocationWithSla | null;
      setAllocation(data ?? null);
      if (data && (role !== "STUDENT" || data.studentId === me)) {
        const ev = await apiFetch(`/opportunities/${opportunity.id}/sla-events`);
        if (ev.ok) setEvents((await ev.json())?.data ?? []);
        if (role === "STUDENT") {
          const week = await apiFetch(`/hours/${me}/week`);
          if (week.ok) setTimer((await week.json())?.data?.runningTimer ?? null);
        }
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity.id, role, me]);

  useEffect(() => {
    load();
  }, [load]);

  /** Runs an action and refreshes the panel from the server's answer. */
  const act = async (key: string, path: string, body?: unknown, success?: string) => {
    const json = await run(key, path, { body, success });
    if (json) await load();
    return json;
  };

  if (loading) {
    return (
      <Card className="p-6">
        <SkeletonRows rows={3} />
      </Card>
    );
  }
  // Other students only see that the work was allocated (in the bid desk), not someone else's delivery
  if (!allocation || (role === "STUDENT" && !isOwner)) return null;

  const sla = allocation.sla;
  const live = allocation.status !== "COMPLETED" && allocation.status !== "CANCELLED";
  const paused = sla?.state === "PAUSED";
  const milestones = allocation.milestones ?? [];
  const submissions = allocation.submissions ?? [];
  const pending = submissions.find((s) => !s.decision);
  const extensions = allocation.extensions ?? [];
  const pendingExtension = extensions.find((e) => e.status === "PENDING");

  const openFile = async (submissionId: string) => {
    try {
      const { url } = await fetchBlobUrl(`/opportunities/${opportunity.id}/submissions/${submissionId}/file`);
      window.open(url, "_blank", "noopener");
    } catch (error) {
      toast((error as Error).message, "error");
    }
  };

  return (
    <Card className="space-y-4 p-6" id="project-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-orange-dark">{isOwner ? "Your project" : "Project delivery"}</p>
          <h2 className="mt-0.5 text-base font-bold text-brand-text">{opportunity.project}</h2>
          {sla?.dueAt && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-brand-text-muted">
              <IconCalendar size={13} /> Agreed deadline <span className="nums font-semibold text-brand-text">{formatDate(sla.dueAt)}</span>
              {allocation.originalSlaDeadline && allocation.originalSlaDeadline !== allocation.slaDeadline && <> (was {formatDate(allocation.originalSlaDeadline)})</>}
              {live && sla.hoursLeft !== null && sla.hoursLeft > 0 && <> · {sla.hoursLeft < 48 ? `${sla.hoursLeft} h left` : `${Math.round(sla.hoursLeft / 24)} days left`}</>}
            </p>
          )}
        </div>
        {sla && <SlaChip state={sla.state} title={sla.reasons.join(" ")} />}
      </div>

      {sla && live && (
        <div className="space-y-1.5">
          <ProgressBar label="Time used" tone={sla.state === "OVERDUE" ? "red" : "blue"} value={sla.timeUsedPercent} />
          {sla.milestonesTotal > 0 && <ProgressBar label={`Milestones (${sla.milestonesDone} of ${sla.milestonesTotal})`} tone="emerald" value={Math.round((sla.milestonesDone / sla.milestonesTotal) * 100)} />}
          {sla.reasons.length > 0 && (sla.state === "AT_RISK" || sla.state === "OVERDUE" || sla.state === "PAUSED") && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-900">
              {sla.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Student: kick-off and the optional timer */}
      {isOwner && live && (
        <div className="flex flex-wrap items-center gap-2">
          {!allocation.kickoffAt && (
            <Button disabled={busy === "kickoff"} onClick={() => act("kickoff", `/opportunities/${opportunity.id}/kickoff`)} variant="primary">
              <IconCheckCircle size={15} /> Kick off
            </Button>
          )}
          {timer ? (
            <Button
              disabled={busy === "timer"}
              onClick={async () => {
                const json = await act("timer", "/hours/timer/stop", undefined);
                if (json) setTimer(null);
              }}
              variant="destructive"
            >
              <IconClock size={15} /> Stop timer ({timeAgo(timer.startedAt!).replace(" ago", "")})
            </Button>
          ) : (
            <Button disabled={busy === "timer" || paused} onClick={() => act("timer", "/hours/timer/start", { opportunityId: opportunity.id }, "Timer started. Stop it when you take a break.")} variant="secondary">
              <IconClock size={15} /> Start timer
            </Button>
          )}
          {timer && timer.opportunityId !== opportunity.id && <span className="text-xs text-brand-text-muted">The running timer is on another project.</span>}
        </div>
      )}

      <Section title="Milestones">
        <ul className="space-y-1.5">
          {milestones.map((m) => (
            <li className="flex items-center justify-between gap-3 rounded-lg border border-brand-border px-3 py-2" key={m.id}>
              <span className={`text-sm ${m.doneAt ? "text-brand-text-muted line-through" : "font-semibold text-brand-text"}`}>{m.title}</span>
              {m.doneAt ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <IconCheckCircle size={13} /> {formatDate(m.doneAt)}
                </span>
              ) : isOwner && live ? (
                <Button className="!px-2.5 !py-1 text-xs" disabled={busy === m.id} onClick={() => act(m.id, `/opportunities/${opportunity.id}/milestones/${m.id}/done`, undefined, `"${m.title}" done.`)} variant="secondary">
                  Mark done
                </Button>
              ) : (
                <span className="text-xs text-brand-text-muted">To do</span>
              )}
            </li>
          ))}
          {milestones.length === 0 && <li className="text-xs text-brand-text-muted">Milestones appear when the student first marks one (older allocation).</li>}
        </ul>
      </Section>

      <Section title="Submissions">
        {submissions.length === 0 && <p className="text-xs text-brand-text-muted">Nothing submitted yet.</p>}
        <ul className="space-y-2">
          {submissions.map((s) => (
            <li className="rounded-lg border border-brand-border p-3" key={s.id}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-brand-text">Round {s.round}</span>
                <span className="text-brand-text-muted">{formatDate(s.submittedAt)}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                {s.link && (
                  <a className="inline-flex items-center gap-1 font-semibold text-brand-blue hover:underline" href={s.link} rel="noopener noreferrer" target="_blank">
                    <IconExternalLink size={12} /> Open link
                  </a>
                )}
                {s.fileName && (
                  <button className="inline-flex items-center gap-1 font-semibold text-brand-blue hover:underline" onClick={() => openFile(s.id)} type="button">
                    <IconFileText size={12} /> {s.fileName}
                  </button>
                )}
              </div>
              {s.note && <p className="mt-1.5 text-xs text-brand-text">{s.note}</p>}
              {s.decision ? (
                <p className={`mt-2 text-xs font-semibold ${s.decision === "ACCEPTED" ? "text-emerald-700" : "text-amber-800"}`}>
                  {s.decision === "ACCEPTED" ? "Accepted" : "Revision requested"} by {s.decidedBy}
                  {s.feedback && <span className="font-normal text-brand-text">: {s.feedback}</span>}
                </p>
              ) : canReview && live ? (
                <ReviewForm
                  busy={busy}
                  onAccept={async (feedback) => {
                    const json = await act("review", `/opportunities/${opportunity.id}/submissions/${s.id}/review`, { decision: "ACCEPT", ...(feedback ? { feedback } : {}) });
                    if (json) celebrate();
                  }}
                  onRevision={(feedback) => act("review", `/opportunities/${opportunity.id}/submissions/${s.id}/review`, { decision: "REVISION", feedback })}
                  revisionsUsed={sla?.revisionsUsed ?? 0}
                />
              ) : (
                <p className="mt-2 text-xs text-brand-text-muted">Waiting for review.</p>
              )}
            </li>
          ))}
        </ul>
        {isOwner && live && !pending && <SubmitForm busy={busy === "submit"} onSubmit={(body) => act("submit", `/opportunities/${opportunity.id}/submissions`, body)} round={submissions.length + 1} />}
      </Section>

      {(extensions.length > 0 || (isOwner && live)) && (
        <Section title="Deadline extension">
          <ul className="space-y-1.5">
            {extensions.map((e) => (
              <li className="rounded-lg border border-brand-border px-3 py-2 text-xs" key={e.id}>
                <p>
                  <span className="font-bold text-brand-text">{e.days} more day{e.days === 1 ? "" : "s"}</span> · {e.reason} ·{" "}
                  <span className={e.status === "APPROVED" ? "font-semibold text-emerald-700" : e.status === "REJECTED" ? "font-semibold text-rose-700" : "font-semibold text-amber-800"}>{e.status.toLowerCase()}</span>
                  {e.decidedBy && <> by {e.decidedBy}</>}
                  {e.note && <>: {e.note}</>}
                </p>
                {e.status === "PENDING" && canManage && <ExtensionDecision busy={busy} onDecide={(body) => act("extension", `/opportunities/${opportunity.id}/extension/${e.id}/decision`, body)} />}
              </li>
            ))}
          </ul>
          {isOwner && live && !pendingExtension && extensions.filter((e) => e.status === "APPROVED").length === 0 && (
            <ExtensionRequest busy={busy === "ask-extension"} onRequest={(body) => act("ask-extension", `/opportunities/${opportunity.id}/extension`, body)} />
          )}
        </Section>
      )}

      {live && (canManage || isOwner) && (
        <Section title={canManage ? "Manage" : "Can't continue?"}>
          {canManage && (
            <ReasonAction
              actions={[
                paused
                  ? { key: "resume", label: "Resume", needsReason: false, run: () => act("resume", `/opportunities/${opportunity.id}/resume`) }
                  : { key: "pause", label: "Pause (exams, leave)", needsReason: true, run: (reason: string) => act("pause", `/opportunities/${opportunity.id}/pause`, { reason }) },
                { key: "cancel", label: "Client cancelled", needsReason: true, danger: true, run: (reason: string) => act("cancel", `/opportunities/${opportunity.id}/cancel`, { reason }) },
              ]}
              busy={busy}
            />
          )}
          {allocation.handBack && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              The student asked to hand this back ({formatDate(allocation.handBack.requestedAt)}): {allocation.handBack.reason}. {canManage ? "Use Reassign in the bid desk below." : "Your coordinator will reassign it."}
            </p>
          )}
          {isOwner && !allocation.handBack && (
            <ReasonAction actions={[{ key: "hand-back", label: "Hand the work back", needsReason: true, danger: true, run: (reason: string) => act("hand-back", `/opportunities/${opportunity.id}/hand-back`, { reason }) }]} busy={busy} />
          )}
        </Section>
      )}

      {events.length > 0 && (
        <Section
          aside={
            <button className="text-xs font-bold text-brand-blue hover:underline" onClick={() => setShowTimeline((v) => !v)} type="button">
              {showTimeline ? "Hide" : `Show ${events.length}`}
            </button>
          }
          title="Timeline"
        >
          {showTimeline && (
            <ol className="space-y-1 border-l-2 border-brand-border pl-3">
              {events.map((e) => (
                <li className="text-xs" key={e.id}>
                  <span className="font-semibold text-brand-text">{EVENT_LABELS[e.type] ?? e.type}</span>
                  <span className="text-brand-text-muted">
                    {" "}
                    · {formatDate(e.at)} · {e.by === "SYSTEM" ? "automatic" : e.by}
                  </span>
                  {e.note && <span className="block text-brand-text-muted">{e.note}</span>}
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}
    </Card>
  );
}

/* ---------------- small forms ---------------- */

function SubmitForm({ onSubmit, busy, round }: { onSubmit: (body: Record<string, string>) => Promise<unknown>; busy: boolean; round: number }) {
  const { toast } = useToast();
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<{ name: string; dataUrl: string } | null>(null);

  const pick = (f: File | undefined) => {
    if (!f) return setFile(null);
    if (f.size > MAX_PDF_BYTES) return toast("The PDF must be 10 MB or smaller.", "error");
    const reader = new FileReader();
    reader.onload = () => setFile({ name: f.name, dataUrl: String(reader.result) });
    reader.readAsDataURL(f);
  };

  return (
    <form
      className="mt-3 space-y-2 rounded-lg border border-dashed border-brand-orange-border bg-brand-orange-light/40 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const done = await onSubmit({ ...(link ? { link } : {}), ...(note ? { note } : {}), ...(file ? { fileUrl: file.dataUrl, fileName: file.name } : {}) });
        if (done) {
          setLink("");
          setNote("");
          setFile(null);
        }
      }}
    >
      <p className="text-xs font-bold text-brand-text">{round === 1 ? "Submit your work" : `Submit round ${round}`}</p>
      <input aria-label="Link to the work" className={inputClass} onChange={(e) => setLink(e.target.value)} placeholder="https://… (GitHub, Figma, Drive)" type="url" value={link} />
      <label className="flex items-center gap-2 text-xs text-brand-text-muted">
        <IconFileText size={13} />
        <input accept="application/pdf" onChange={(e) => pick(e.target.files?.[0])} type="file" />
      </label>
      <textarea aria-label="Note for the reviewer" className={inputClass} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="What's included, anything the reviewer should know (optional)" rows={2} value={note} />
      <Button disabled={busy || (!link && !file)} type="submit" variant="primary">
        <IconSend size={14} /> Submit
      </Button>
    </form>
  );
}

function ReviewForm({ onAccept, onRevision, busy, revisionsUsed }: { onAccept: (feedback: string) => Promise<unknown>; onRevision: (feedback: string) => Promise<unknown>; busy: string | null; revisionsUsed: number }) {
  const [feedback, setFeedback] = useState("");
  return (
    <div className="mt-2 space-y-2">
      <textarea aria-label="Feedback" className={inputClass} maxLength={1000} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback (required for a revision)" rows={2} value={feedback} />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy === "review"} onClick={() => onAccept(feedback.trim())} variant="primary">
          <IconCheckCircle size={14} /> Accept
        </Button>
        <Button disabled={busy === "review" || feedback.trim().length < 5} onClick={() => onRevision(feedback.trim())} variant="secondary">
          Ask for a revision
        </Button>
        <span className="text-[11px] text-brand-text-muted">{revisionsUsed} of 2 included revisions used</span>
      </div>
    </div>
  );
}

function ExtensionRequest({ onRequest, busy }: { onRequest: (body: { days: number; reason: string }) => Promise<unknown>; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(2);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button className="mt-1 text-xs font-bold text-brand-blue hover:underline" onClick={() => setOpen(true)} type="button">
        Need more time? Ask before the deadline
      </button>
    );
  }
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onRequest({ days, reason: reason.trim() })) setOpen(false);
      }}
    >
      <label className="text-xs text-brand-text-muted">
        Days
        <input className={`${inputClass} mt-1 w-20`} max={30} min={1} onChange={(e) => setDays(Number(e.target.value))} type="number" value={days} />
      </label>
      <label className="min-w-[12rem] flex-1 text-xs text-brand-text-muted">
        Reason
        <input className={`${inputClass} mt-1`} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. client sent the assets late" value={reason} />
      </label>
      <Button disabled={busy || reason.trim().length < 5} type="submit" variant="secondary">
        Ask
      </Button>
    </form>
  );
}

function ExtensionDecision({ onDecide, busy }: { onDecide: (body: { approve: boolean; note?: string; clientAgreed?: boolean }) => Promise<unknown>; busy: string | null }) {
  const [note, setNote] = useState("");
  const [clientAgreed, setClientAgreed] = useState(false);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input aria-label="Note to the student" className={`${inputClass} max-w-xs`} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" value={note} />
      <label className="flex items-center gap-1.5 text-[11px] text-brand-text-muted">
        <input checked={clientAgreed} onChange={(e) => setClientAgreed(e.target.checked)} type="checkbox" /> Client agreed to a later date
      </label>
      <Button className="!px-2.5 !py-1 text-xs" disabled={busy === "extension"} onClick={() => onDecide({ approve: true, ...(note ? { note } : {}), ...(clientAgreed ? { clientAgreed } : {}) })} variant="primary">
        Approve
      </Button>
      <Button className="!px-2.5 !py-1 text-xs" disabled={busy === "extension"} onClick={() => onDecide({ approve: false, ...(note ? { note } : {}) })} variant="secondary">
        Refuse
      </Button>
    </div>
  );
}

interface ReasonActionItem {
  key: string;
  label: string;
  needsReason: boolean;
  danger?: boolean;
  run: (reason: string) => Promise<unknown>;
}

/** Buttons that ask for a short reason first (pause, cancel, hand back). */
function ReasonAction({ actions, busy }: { actions: ReasonActionItem[]; busy: string | null }) {
  const [active, setActive] = useState<ReasonActionItem | null>(null);
  const [reason, setReason] = useState("");
  if (active) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await active.run(reason.trim())) {
            setActive(null);
            setReason("");
          }
        }}
      >
        <input aria-label="Reason" autoFocus className={`${inputClass} min-w-[14rem] flex-1`} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder={`Reason: ${active.label.toLowerCase()}`} value={reason} />
        <Button disabled={busy === active.key || reason.trim().length < 5} type="submit" variant={active.danger ? "destructive" : "primary"}>
          {active.label}
        </Button>
        <Button onClick={() => setActive(null)} variant="ghost">
          Cancel
        </Button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button disabled={busy === a.key} key={a.key} onClick={() => (a.needsReason ? setActive(a) : a.run(""))} variant={a.danger ? "destructive" : "secondary"}>
          {a.label}
        </Button>
      ))}
    </div>
  );
}
