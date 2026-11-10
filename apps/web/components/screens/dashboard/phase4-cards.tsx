"use client";

import { SAFEGUARD_RULES, workingDaysBetween, type HelpRequest, type SlaBoardItem, type WeeklyCheckin } from "@edurev/types";
import { TabCard } from "@/components/ui/tab-card";
import { IconAlertTriangle, IconMessage } from "@/components/ui/icons";
import { SlaChip } from "@/components/safeguards/sla-chip";
import { formatDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { CardList, CardRow } from "./card-parts";

// Phase 4 staff cards (docs/modules/sla-and-delivery.md, docs/modules/safeguards.md): "At-risk projects" (U9 follow-up,
// G12), "Help requests" (G6) and the waiting-time chip for staff service levels (G11).

interface SlaBoard {
  items: SlaBoardItem[];
  overCap: Pick<WeeklyCheckin, "studentId" | "weekStart" | "totalHours" | "cap" | "source">[];
}

const URGENT = new Set(["OVERDUE", "AT_RISK", "SUBMITTED", "NOT_STARTED"]);

/** G12: live projects that need someone: overdue, at risk, waiting for review, not kicked off, or asking for a change. */
export function AtRiskProjectsCard() {
  const board = useResource<SlaBoard>("/sla/board");
  const items = (board.data?.items ?? []).filter((i) => URGENT.has(i.sla.state) || i.pendingExtension || i.handBackRequested);
  const overCap = board.data?.overCap ?? [];
  return (
    <TabCard
      count={items.length}
      empty={items.length === 0 && overCap.length === 0}
      emptyText="Every live project is on track."
      error={board.error}
      icon={<IconAlertTriangle size={13} />}
      loading={board.loading}
      onRetry={board.retry}
      title="At-risk projects"
    >
      <CardList>
        {items.slice(0, 5).map((i) => (
          <CardRow
            aside={<SlaChip state={i.sla.state} title={i.sla.reasons.join(" ")} />}
            href={`/opportunities/${i.opportunityId}#project-panel`}
            key={i.opportunityId}
            meta={
              <>
                {i.studentName}
                {i.sla.dueAt && (
                  <>
                    {" "}
                    · due <span className="nums">{formatDate(i.sla.dueAt)}</span>
                  </>
                )}
                {i.pendingExtension && <> · extension asked</>}
                {i.handBackRequested && <> · wants to hand back</>}
              </>
            }
            title={i.title}
          />
        ))}
      </CardList>
      {overCap.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {overCap.length} check-in{overCap.length === 1 ? "" : "s"} over the weekly hour cap (e.g. <span className="nums">{overCap[0].totalHours} h</span> of{" "}
          <span className="nums">{overCap[0].cap} h</span>, week of {formatDate(overCap[0].weekStart)}). Check in with the student; current work isn&apos;t blocked.
        </p>
      )}
    </TabCard>
  );
}

/** G6: open help requests routed to this role (all of them for an Administrator), oldest first. */
export function HelpRequestsCard({ replyDays }: { replyDays: number }) {
  const help = useResource<HelpRequest[]>("/help-requests?status=OPEN");
  const items = [...(help.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <TabCard
      count={items.length}
      empty={items.length === 0}
      emptyText="No students are waiting for help."
      error={help.error}
      href="/messages"
      icon={<IconMessage size={13} />}
      loading={help.loading}
      onRetry={help.retry}
      title="Help requests"
      viewAllLabel="Open Messages"
    >
      <CardList>
        {items.slice(0, 4).map((r) => (
          <CardRow
            aside={<WaitingChip limitDays={replyDays} since={r.escalatedAt || r.createdAt} />}
            href={`/messages?c=${r.conversationId}`}
            key={r.id}
            meta={
              <>
                {SAFEGUARD_RULES[r.rule]?.label ?? r.rule}
                {r.escalationLevel > 0 && <> · escalated</>}
              </>
            }
            title={r.studentName}
          />
        ))}
      </CardList>
    </TabCard>
  );
}

/** G11: how long something has waited, in working days (Mon–Fri), red once it's past the agreed limit. */
export function WaitingChip({ since, limitDays }: { since: string; limitDays: number }) {
  const days = workingDaysBetween(new Date(since), new Date());
  const late = days > limitDays;
  return (
    <span className={`nums whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${late ? "bg-rose-50 text-rose-800" : "text-brand-text-muted"}`} title={`Target: within ${limitDays} working day${limitDays === 1 ? "" : "s"}`}>
      {days === 0 ? "today" : `${days} working day${days === 1 ? "" : "s"}`}
      {late && " · late"}
    </span>
  );
}
