"use client";

import { usePathname, useRouter } from "next/navigation";
import { can, DEFAULT_SAFEGUARD_LIMITS, type DashboardMetrics, type InboxItem, type SafeguardLimits, type Student } from "@edurev/types";
import { Button } from "@/components/ui/button";
import { CardBoundary } from "@/components/ui/card-boundary";
import { firstName, greetingFor, HeroBanner } from "@/components/ui/hero-banner";
import { TabCard } from "@/components/ui/tab-card";
import {
  IconAnalytics,
  IconBriefcase,
  IconEarnings,
  IconFileText,
  IconGraduationCap,
  IconPlus,
  IconStudents,
  IconUserCheck,
} from "@/components/ui/icons";
import { useAuth } from "@/lib/auth-context";
import { relativeDue, staffNotices } from "@/lib/dashboard-items";
import { formatCurrency, formatDate, timeAgo } from "@/lib/format";
import { roleLabels } from "@/lib/navigation";
import { quickActionsFor, runQuickAction } from "@/lib/quick-actions";
import { useResource } from "@/lib/use-resource";
import { useWorkQueue } from "@/lib/work-queue";
import { CardList, CardRow, Figure } from "./card-parts";
import { InboxCard } from "./inbox-card";
import { AtRiskProjectsCard, HelpRequestsCard, WaitingChip } from "./phase4-cards";
import { NoticeLine } from "./notice-line";
import { QuickLinks } from "./quick-links";

const QUEUE_ERROR = "Couldn't load this list.";

/**
 * U9: the staff home. A card appears only when the role has the permission behind it (the same PERMISSIONS
 * the API enforces), so a role never sees a card it can't act on. Work-queue cards share one refresh;
 * the rest read their own requests (docs/modules/ui-shell.md).
 */
export function StaffDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const queue = useWorkQueue();
  const role = user!.role;

  const inbox = useResource<InboxItem[]>("/messages");
  const metrics = useResource<DashboardMetrics>(can(role, "ANALYTICS_VIEW") ? "/dashboard" : null, (json) => json?.metrics ?? null);
  const supervises = can(role, "STUDENT_SUPERVISE");
  const students = useResource<Student[]>(supervises ? "/students" : null);
  const checkIns = (students.data ?? []).filter((s) => s.status === "ACTIVE" && s.trainingProgress < 60);
  // G11: staff service levels (working days) come from the safeguard limits
  const limits = useResource<SafeguardLimits>("/safeguards/limits").data ?? DEFAULT_SAFEGUARD_LIMITS;

  const actions = quickActionsFor(role);
  const messageAction = actions.find((a) => a.id === "new-message");
  const waiting =
    (can(role, "SIGNUP_REVIEW") ? queue.signupRequests.length : 0) +
    (can(role, "EARNINGS_VERIFY") ? queue.pendingEarnings.length : 0) +
    (can(role, "OPPORTUNITY_ALLOCATE") ? queue.reviewOpportunities.length : 0) +
    (can(role, "TIER_UPDATE") ? queue.tierSuggestions.length : 0) +
    queue.reviewProposals.length;
  const retryQueue = () => queue.refresh();

  return (
    <div className="space-y-6">
      <HeroBanner
        eyebrow={roleLabels[role]}
        title={`${greetingFor()}, ${firstName(user!.name)}`}
        subtitle={queue.loading ? "Checking what needs you…" : waiting > 0 ? `${waiting} item${waiting === 1 ? " is" : "s are"} waiting for you.` : "You're all caught up."}
        action={actions.map((action) => (
          <Button className="text-xs" key={action.id} onClick={() => runQuickAction(action, pathname, router.push)} variant="primary">
            <IconPlus size={14} />
            {action.label}
          </Button>
        ))}
      />

      {can(role, "OPPORTUNITY_ALLOCATE") && <NoticeLine moreHref="/opportunities" notices={staffNotices(queue.reviewOpportunities)} />}
      <QuickLinks />

      <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
        {can(role, "SIGNUP_REVIEW") && (
          <CardBoundary title="Sign-up requests">
            <TabCard
              count={queue.signupRequests.length}
              empty={queue.signupRequests.length === 0}
              emptyText="No sign-ups waiting for approval."
              error={queue.failed.signupRequests ? QUEUE_ERROR : null}
              href="/students#signup-requests"
              icon={<IconUserCheck size={13} />}
              loading={queue.loading}
              onRetry={retryQueue}
              title="Sign-up requests"
              viewAllLabel="Review sign-ups"
            >
              <CardList>
                {queue.signupRequests.slice(0, 4).map((r) => (
                  <CardRow
                    aside={<WaitingChip limitDays={limits.signupReviewDays} since={r.requestedAt} />}
                    href="/students#signup-requests"
                    key={r.userId}
                    meta={
                      <>
                        <span className="nums">{r.registrationNumber}</span> · {r.course} {r.program} · Year {r.year}
                      </>
                    }
                    title={r.name}
                  />
                ))}
              </CardList>
            </TabCard>
          </CardBoundary>
        )}

        {can(role, "EARNINGS_VERIFY") && (
          <CardBoundary title="Earnings to verify">
            <TabCard
              count={queue.pendingEarnings.length}
              empty={queue.pendingEarnings.length === 0}
              emptyText="No earnings waiting for verification."
              error={queue.failed.earnings ? QUEUE_ERROR : null}
              href="/earnings?tab=verify"
              icon={<IconEarnings size={13} />}
              loading={queue.loading}
              onRetry={retryQueue}
              title="Earnings to verify"
              viewAllLabel="Verify earnings"
            >
              <CardList>
                {queue.pendingEarnings.slice(0, 4).map((e) => (
                  <CardRow
                    aside={
                      <span className="flex flex-col items-end gap-0.5">
                        <span className="nums font-bold text-brand-text">{formatCurrency(e.convertedAmount)}</span>
                        <WaitingChip limitDays={limits.earningVerifyDays} since={e.createdAt} />
                      </span>
                    }
                    href="/earnings?tab=verify"
                    key={e.id}
                    meta={
                      <>
                        {e.platformName} · submitted {timeAgo(e.createdAt)}
                      </>
                    }
                    title={e.projectTitle || e.platformName}
                  />
                ))}
              </CardList>
            </TabCard>
          </CardBoundary>
        )}

        {can(role, "SLA_BOARD_VIEW") && (
          <CardBoundary title="At-risk projects">
            <AtRiskProjectsCard />
          </CardBoundary>
        )}

        {can(role, "HELP_RESOLVE") && (
          <CardBoundary title="Help requests">
            <HelpRequestsCard replyDays={limits.helpReplyWorkingDays} />
          </CardBoundary>
        )}

        {can(role, "OPPORTUNITY_ALLOCATE") && (
          <CardBoundary title="Bids waiting">
            <TabCard
              count={queue.reviewOpportunities.length}
              empty={queue.reviewOpportunities.length === 0}
              emptyText="No opportunities have bids waiting for a decision."
              error={queue.failed.opportunities ? QUEUE_ERROR : null}
              href="/opportunities"
              icon={<IconBriefcase size={13} />}
              loading={queue.loading}
              onRetry={retryQueue}
              title="Bids waiting"
              viewAllLabel="All opportunities"
            >
              <CardList>
                {queue.reviewOpportunities.slice(0, 4).map((o) => (
                  <CardRow
                    aside={
                      <span className="nums font-bold text-brand-text">
                        {o.numberOfBids} bid{o.numberOfBids === 1 ? "" : "s"}
                      </span>
                    }
                    href={`/opportunities/${o.id}`}
                    key={o.id}
                    meta={
                      o.bidsCloseAt ? (
                        <>
                          {o.company} ·{" "}
                          {new Date(o.bidsCloseAt).getTime() <= Date.now() ? (
                            <>
                              bidding closed <span className="nums">{formatDate(o.bidsCloseAt)}</span>
                            </>
                          ) : (
                            <>bidding {relativeDue(o.bidsCloseAt, Date.now(), "closes")}</>
                          )}
                        </>
                      ) : (
                        <>
                          {o.company} · client due <span className="nums">{formatDate(o.deadline)}</span>
                        </>
                      )
                    }
                    title={o.project}
                  />
                ))}
              </CardList>
            </TabCard>
          </CardBoundary>
        )}

        {can(role, "TIER_UPDATE") && (
          <CardBoundary title="Tier suggestions">
            <TabCard
              count={queue.tierSuggestions.length}
              empty={queue.tierSuggestions.length === 0}
              emptyText="No tier suggestions to review. Only an Administrator changes official tiers."
              error={queue.failed.tierSuggestions ? QUEUE_ERROR : null}
              href="/students#tier-suggestions"
              icon={<IconGraduationCap size={13} />}
              loading={queue.loading}
              onRetry={retryQueue}
              title="Tier suggestions"
              viewAllLabel="Review suggestions"
            >
              <CardList>
                {queue.tierSuggestions.slice(0, 4).map((s) => (
                  <CardRow
                    aside={
                      <span className="nums font-bold text-brand-text">
                        {s.currentTier.replace("_", " ")} → {s.suggestedTier.replace("_", " ")}
                      </span>
                    }
                    href="/students#tier-suggestions"
                    key={s.id}
                    meta={s.reasons?.[0]}
                    title={s.studentName}
                  />
                ))}
              </CardList>
            </TabCard>
          </CardBoundary>
        )}

        {/* Shown only when the work queue loaded proposals for this role and some are in review */}
        {(queue.reviewProposals.length > 0 || queue.failed.proposals) && (
          <CardBoundary title="Proposals in review">
            <TabCard
              count={queue.reviewProposals.length}
              error={queue.failed.proposals ? QUEUE_ERROR : null}
              href="/proposals"
              icon={<IconFileText size={13} />}
              onRetry={retryQueue}
              title="Proposals in review"
              viewAllLabel="Open proposals"
            >
              <CardList>
                {queue.reviewProposals.slice(0, 4).map((p) => (
                  <CardRow aside={<span className="nums text-brand-text-muted">v{p.version}</span>} href="/proposals" key={p.id} meta={p.studentName} title={p.title} />
                ))}
              </CardList>
            </TabCard>
          </CardBoundary>
        )}

        {supervises && (
          <CardBoundary title="Students to check in with">
            <TabCard
              count={checkIns.length}
              empty={checkIns.length === 0}
              emptyText="Every active student is at 60% training or more."
              error={students.error}
              href="/students"
              icon={<IconStudents size={13} />}
              loading={students.loading}
              onRetry={students.retry}
              title="Students to check in with"
              viewAllLabel="All students"
            >
              <CardList>
                {checkIns.slice(0, 4).map((s) => (
                  <CardRow aside={<span className="nums font-bold text-brand-text">{s.trainingProgress}%</span>} href={`/students/${s.id}`} key={s.id} meta={`${s.course} · Year ${s.year} · training below 60%`} title={s.name} />
                ))}
              </CardList>
            </TabCard>
          </CardBoundary>
        )}

        <CardBoundary title="My messages">
          <InboxCard
            action={
              messageAction && (
                <Button className="!px-2 !py-0.5 !text-[11px]" onClick={() => runQuickAction(messageAction, pathname, router.push)} variant="primary">
                  <IconPlus size={12} />
                  New
                </Button>
              )
            }
            inbox={inbox}
            kind="DIRECT"
            viewer="staff"
          />
        </CardBoundary>

        <CardBoundary title="Announcements">
          <InboxCard inbox={inbox} kind="ANNOUNCEMENT" viewer="staff" />
        </CardBoundary>

        {can(role, "ANALYTICS_VIEW") && (
          <CardBoundary title="At a glance">
            <TabCard error={metrics.error} href="/analytics" icon={<IconAnalytics size={13} />} loading={metrics.loading} onRetry={metrics.retry} title="At a glance" viewAllLabel="Full analytics">
              {metrics.data && (
                <div className="grid grid-cols-2 gap-4">
                  <Figure label="Active students" value={String(metrics.data.activeStudents)} />
                  <Figure label="Open opportunities" value={String(metrics.data.opportunityPipeline)} />
                  <Figure label="Verified this month" value={formatCurrency(metrics.data.monthlyEarnings)} />
                  <Figure label="Allocations" value={String(metrics.data.allocations)} />
                </div>
              )}
              <p className="mt-3 text-[11px] text-brand-text-muted">Totals for the whole programme. No individual earnings are shown.</p>
            </TabCard>
          </CardBoundary>
        )}
      </div>

    </div>
  );
}
