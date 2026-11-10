"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  nextTierOf,
  skillMatch,
  TIER_INFO,
  type Allocation,
  type BlackoutPeriod,
  type EarningsSummary,
  type InboxItem,
  type Opportunity,
  type StudentReadinessSummary,
} from "@edurev/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardBoundary } from "@/components/ui/card-boundary";
import { firstName, greetingFor, HeroBanner } from "@/components/ui/hero-banner";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { TabCard } from "@/components/ui/tab-card";
import { TierBadge } from "@/components/ui/tier-badge";
import { currentStage, JourneyStepper, MountainProgress } from "@/components/student/journey";
import { ProfileCompletenessCard } from "@/components/profile/profile-completeness-card";
import { MyWeekCard } from "@/components/hours/my-week-card";
import { SlaChip } from "@/components/safeguards/sla-chip";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBriefcase,
  IconCalendar,
  IconEarnings,
  IconGraduationCap,
  IconMegaphone,
  IconOpportunities,
  IconPlus,
} from "@/components/ui/icons";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  activeProjects,
  allocatedTo,
  deadlinesFor,
  opportunitiesFor,
  projectDueState,
  relativeDue,
  studentNotices,
  type ProjectItem,
} from "@/lib/dashboard-items";
import { formatCurrency, formatDate } from "@/lib/format";
import { useMyProfile } from "@/lib/my-profile";
import { quickActionsFor, runQuickAction } from "@/lib/quick-actions";
import { useResource, type Resource } from "@/lib/use-resource";
import { CardList, CardRow, DueChip, Figure } from "./card-parts";
import { InboxCard } from "./inbox-card";
import { NoticeLine } from "./notice-line";
import { QuickLinks } from "./quick-links";

/** The signed-in student's allocated work, with each allocation's agreed deadline (read per project). */
function useMyProjects(opportunities: Resource<Opportunity[]>, studentId: string): { items: ProjectItem[]; loading: boolean; error: string | null } {
  const { apiFetch } = useApi();
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opportunities.loading) return;
    if (opportunities.error || !opportunities.data) {
      setLoading(false);
      return;
    }
    const mine = allocatedTo(opportunities.data, studentId);
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(
      mine.map(async (o) => {
        const res = await apiFetch(`/opportunities/${o.id}/allocation`);
        if (!res.ok) throw new Error();
        return ((await res.json())?.data ?? null) as Allocation | null;
      })
    )
      .then((allocations) => {
        if (!cancelled) setItems(activeProjects(mine, allocations));
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your project deadlines.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunities.data, opportunities.loading, opportunities.error, studentId]);

  return { items, loading: opportunities.loading || loading, error: opportunities.error ?? error };
}

/**
 * U8: the student home. Each card reads only the requests it needs and is wrapped in a CardBoundary,
 * so one failing request or card never breaks the rest (docs/modules/ui-shell.md).
 */
export function StudentDashboard() {
  const { user } = useAuth();
  const { student: profile } = useMyProfile();
  const router = useRouter();
  const pathname = usePathname();
  const studentId = user!.studentId || user!.id;

  const readiness = useResource<StudentReadinessSummary>(`/students/${studentId}/readiness`);
  const opportunities = useResource<Opportunity[]>("/opportunities");
  const inbox = useResource<InboxItem[]>("/messages");
  const earnings = useResource<EarningsSummary>("/earnings/summary");
  const blackouts = useResource<BlackoutPeriod[]>("/blackouts");
  const projects = useMyProjects(opportunities, studentId);

  // The official tier: from the readiness record, or the cached profile if that request failed
  const student = readiness.data?.student ?? profile;
  const tier = student?.tier ?? "TIER_1";
  const now = Date.now();
  const forMe = useMemo(() => (opportunities.data ? opportunitiesFor(opportunities.data, tier) : []), [opportunities.data, tier]);
  const notices = projects.loading ? [] : studentNotices(projects.items, forMe, blackouts.data ?? [], now);
  const important = (inbox.data ?? []).filter((i) => i.unread && i.conversation.priority === "IMPORTANT");
  const logEarning = quickActionsFor(user!.role).find((a) => a.id === "new-earning");

  return (
    <div className="space-y-6">
      <HeroBanner
        eyebrow="Your workspace"
        title={`${greetingFor()}, ${firstName(user!.name)}`}
        subtitle={
          student ? (
            <span className="flex flex-wrap items-center gap-2">
              <TierBadge tier={student.tier} />
              {readiness.data && <span>{readiness.data.training.progressPercentage}% training complete</span>}
            </span>
          ) : readiness.error ? (
            "Your progress couldn't load. The cards below show what's available."
          ) : (
            "Loading your progress…"
          )
        }
        action={
          <>
            {logEarning && (
              <Button className="text-xs" onClick={() => runQuickAction(logEarning, pathname, router.push)} variant="primary">
                <IconPlus size={14} />
                Log an earning
              </Button>
            )}
            <Link href="/opportunities">
              <Button className="border-white/20 bg-white/10 text-xs text-white hover:bg-white/20" variant="secondary">
                Browse opportunities
              </Button>
            </Link>
          </>
        }
      />

      <NoticeLine moreHref="#deadlines" notices={notices} />
      <QuickLinks />

      {important.map((item) => (
        <Link
          className="rise-in flex items-center gap-4 rounded-card border border-rose-200 bg-rose-50/70 p-4 transition hover:border-rose-300"
          href={`/messages?c=${item.conversation.id}`}
          key={item.conversation.id}
        >
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-700">
            <IconMegaphone size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold uppercase tracking-wider text-rose-700">Important · from {item.conversation.staff.name}</span>
            <span className="block truncate font-bold text-brand-text">{item.conversation.subject}</span>
            <span className="block truncate text-xs text-brand-text-muted">{item.conversation.lastMessagePreview}</span>
          </span>
          <span className="shrink-0 text-xs font-bold text-rose-700">Read →</span>
        </Link>
      ))}

      {student && <ProfileCompletenessCard compact student={student} />}

      <NextStep forMe={forMe} readiness={readiness} studentId={studentId} />

      <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
        <CardBoundary title="My training">
          <TrainingCard readiness={readiness} studentId={studentId} />
        </CardBoundary>
        <CardBoundary title="Active projects">
          <ActiveProjectsCard projects={projects} readiness={readiness} />
        </CardBoundary>
        <CardBoundary title="My week">
          <MyWeekCard studentId={studentId} />
        </CardBoundary>
        <CardBoundary title="Deadlines">
          <DeadlinesCard blackouts={blackouts} forMe={forMe} projects={projects} />
        </CardBoundary>
        <CardBoundary className="xl:col-span-2" title="Opportunities for you">
          <OpportunitiesCard forMe={forMe} opportunities={opportunities} readiness={readiness} tierKnown={Boolean(student)} />
        </CardBoundary>
        <CardBoundary title="Earnings">
          <EarningsCard earnings={earnings} onLog={logEarning ? () => runQuickAction(logEarning, pathname, router.push) : undefined} />
        </CardBoundary>
        <CardBoundary title="Messages">
          <InboxCard inbox={inbox} kind="DIRECT" viewer="student" />
        </CardBoundary>
        <CardBoundary title="Announcements">
          <InboxCard inbox={inbox} kind="ANNOUNCEMENT" viewer="student" />
        </CardBoundary>
        <CardBoundary title="Tier climb">
          {/* Falls back to the cached profile, so it still shows if the readiness request failed */}
          <TabCard
            error={student ? null : readiness.error}
            href="/profile"
            icon={<IconGraduationCap size={13} />}
            loading={!student && readiness.loading}
            onRetry={readiness.retry}
            title="Tier climb"
            viewAllLabel="My profile"
          >
            {student && <MountainProgress progress={readiness.data?.training.progressPercentage ?? student.trainingProgress} tier={student.tier} />}
          </TabCard>
        </CardBoundary>
      </div>

      <CardBoundary title="Your journey">
        <TabCard error={readiness.error} loading={readiness.loading} onRetry={readiness.retry} title="Your journey">
          {readiness.data && <JourneyStepper stage={currentStage(readiness.data.student, readiness.data.training.progressPercentage)} />}
        </TabCard>
      </CardBoundary>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Next step (kept from the earlier dashboard)                        */
/* ------------------------------------------------------------------ */

function NextStep({ readiness, forMe, studentId }: { readiness: Resource<StudentReadinessSummary>; forMe: Opportunity[]; studentId: string }) {
  if (readiness.loading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="mt-3 h-3 w-1/2" />
      </Card>
    );
  }
  const data = readiness.data;
  const nextModule = data?.training.modules.find((m) => m.status !== "COMPLETED");
  const blocked = data && !data.safeguardCheck.eligible;

  const step = blocked
    ? { tone: "red" as const, title: "Action needed before you can be allocated work", detail: data!.safeguardCheck.reasons[0], href: "/safeguards", cta: "What unlocks it" }
    : nextModule
      ? { tone: "orange" as const, title: `Continue “${nextModule.title.trim()}”`, detail: `${nextModule.completionPercentage}% complete · training builds your readiness`, href: `/students/${studentId}`, cta: "Open training" }
      : forMe[0]
        ? { tone: "orange" as const, title: `Bid on “${forMe[0].project}”`, detail: `${forMe[0].company} · ${formatCurrency(forMe[0].budget)} · open to your tier`, href: `/opportunities/${forMe[0].id}`, cta: "Place a bid" }
        : { tone: "orange" as const, title: "Browse open opportunities", detail: "New client work is published regularly.", href: "/opportunities", cta: "Browse" };

  return (
    <Card className={`p-5 ${step.tone === "red" ? "border-rose-200 bg-rose-50/60" : "border-brand-orange-border bg-brand-orange-light/60"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {/* U10: charcoal on orange (white on orange is too faint) */}
          <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${step.tone === "red" ? "bg-rose-100 text-rose-700" : "bg-brand-orange text-brand-text"}`}>
            {step.tone === "red" ? <IconAlertTriangle size={18} /> : <IconArrowRight size={18} />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-orange-dark">{step.tone === "red" ? "Action needed" : "Your next step"}</p>
            <h2 className="mt-0.5 font-bold text-brand-text">{step.title}</h2>
            <p className="mt-0.5 text-xs text-brand-text-muted">{step.detail}</p>
          </div>
        </div>
        <Link className="shrink-0" href={step.href}>
          <Button className="w-full text-xs sm:w-auto" variant="primary">
            {step.cta}
            <IconArrowRight size={14} />
          </Button>
        </Link>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Cards                                                              */
/* ------------------------------------------------------------------ */

/** The end date of the blackout behind a deadline row (rows carry the start date). */
function blackoutEnd(rowId: string, blackouts: BlackoutPeriod[]): string {
  return blackouts.find((b) => `blackout-${b.id}` === rowId)?.endDate ?? "";
}

function TrainingCard({ readiness, studentId }: { readiness: Resource<StudentReadinessSummary>; studentId: string }) {
  const data = readiness.data;
  const training = data?.training;
  const nextModule = training?.modules.find((m) => m.status !== "COMPLETED");
  const tier = data?.student.tier;
  const next = tier ? nextTierOf(tier) : null;

  return (
    <TabCard
      empty={Boolean(training && training.totalCount === 0)}
      emptyText="No training modules are assigned to you yet."
      error={readiness.error}
      href={`/students/${studentId}`}
      icon={<IconGraduationCap size={13} />}
      loading={readiness.loading}
      onRetry={readiness.retry}
      title="My training"
      viewAllLabel="Open training"
    >
      {training && (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <Figure label="Complete" value={`${training.progressPercentage}%`} />
            <p className="nums text-xs font-semibold text-brand-text-muted">
              {training.completedCount} of {training.totalCount} modules
            </p>
          </div>
          <ProgressBar value={training.progressPercentage} />
          {nextModule ? (
            <p className="truncate text-xs text-brand-text-muted" title={nextModule.title}>
              Next: <span className="font-bold text-brand-text">{nextModule.title.trim()}</span> · <span className="nums">{nextModule.completionPercentage}%</span>
            </p>
          ) : (
            <p className="text-xs font-semibold text-emerald-800">All modules complete.</p>
          )}
          <p className="text-xs text-brand-text-muted">
            {next ? `Training counts toward ${next.replace("_", " ")} · ${TIER_INFO[next].name}.` : "You're at the top tier. Training keeps your skills current."}
          </p>
        </div>
      )}
    </TabCard>
  );
}

/** G9: each project shows the server's SLA state (milestones, kick-off, pauses…); weekly hours live in "My week". */
function ActiveProjectsCard({ projects }: { projects: { items: ProjectItem[]; loading: boolean; error: string | null }; readiness: Resource<StudentReadinessSummary> }) {
  return (
    <TabCard
      empty={projects.items.length === 0}
      emptyAction={
        <Link href="/opportunities">
          <Button className="text-xs" variant="secondary">
            Browse opportunities
          </Button>
        </Link>
      }
      emptyText="No active projects. Win a bid to start one."
      error={projects.error}
      icon={<IconBriefcase size={13} />}
      loading={projects.loading}
      title="Active projects"
    >
      <CardList>
        {projects.items.slice(0, 4).map((p) => (
          <CardRow
            aside={p.allocation?.sla ? <SlaChip state={p.allocation.sla.state} title={p.allocation.sla.reasons.join(" ")} /> : <DueChip state={projectDueState(p)} />}
            href={`/opportunities/${p.opportunity.id}`}
            key={p.opportunity.id}
            meta={
              <>
                {p.opportunity.company} · Due <span className="nums">{formatDate(p.dueAt)}</span>
              </>
            }
            title={p.opportunity.project}
          />
        ))}
      </CardList>
    </TabCard>
  );
}

function DeadlinesCard({ projects, forMe, blackouts }: { projects: { items: ProjectItem[]; loading: boolean; error: string | null }; forMe: Opportunity[]; blackouts: Resource<BlackoutPeriod[]> }) {
  const items = deadlinesFor(projects.items, forMe, blackouts.data ?? []).slice(0, 5);
  return (
    <div className="scroll-mt-24" id="deadlines">
      <TabCard
        empty={items.length === 0 && !blackouts.error}
        emptyText="Nothing due. Project deadlines, bid closing dates and exam blackouts show up here."
        error={projects.error}
        icon={<IconCalendar size={13} />}
        loading={projects.loading || blackouts.loading}
        title="Deadlines"
      >
        <CardList>
          {items.map((item) => (
            <CardRow
              aside={item.kind === "Project due" ? <DueChip state={item.state} /> : <span className="nums font-semibold text-brand-text-muted">{formatDate(item.at)}</span>}
              href={item.href}
              key={item.id}
              meta={
                <>
                  <span className="font-semibold text-brand-text">{item.kind}</span> ·{" "}
                  {item.kind === "Project due" ? (
                    <span className="nums">{formatDate(item.at)}</span>
                  ) : item.kind === "Bids close" ? (
                    relativeDue(item.at, Date.now(), "closes")
                  ) : (
                    <>until {formatDate(blackoutEnd(item.id, blackouts.data ?? []))}</>
                  )}
                </>
              }
              title={item.label}
            />
          ))}
        </CardList>
        {blackouts.error && (
          <p className="mt-2 flex items-center gap-2 text-xs text-rose-800">
            Exam dates couldn&apos;t load.
            <button className="font-bold underline" onClick={blackouts.retry} type="button">
              Retry
            </button>
          </p>
        )}
      </TabCard>
    </div>
  );
}

function OpportunitiesCard({ opportunities, forMe, tierKnown, readiness }: { opportunities: Resource<Opportunity[]>; forMe: Opportunity[]; tierKnown: boolean; readiness: Resource<StudentReadinessSummary> }) {
  // F4: the real skill match ("2 of 3 skills"), from the student's skills and completed training
  const skills = readiness.data?.student.skills;
  const trained = (readiness.data?.training.modules ?? []).filter((m) => m.status === "COMPLETED").map((m) => m.title);
  return (
    <TabCard
      count={forMe.length}
      empty={forMe.length === 0}
      emptyText={tierKnown ? "No open work for your tier right now. New client work is published regularly." : "Open work for your tier shows here once your record loads."}
      error={opportunities.error}
      href="/opportunities"
      icon={<IconOpportunities size={13} />}
      loading={opportunities.loading}
      onRetry={opportunities.retry}
      title="Opportunities for you"
      viewAllLabel="Browse all opportunities"
    >
      <CardList>
        {forMe.slice(0, 4).map((o) => (
          <CardRow
            aside={
              <span className="inline-flex items-center gap-2">
                <span className="nums hidden font-bold text-brand-text sm:inline">{formatCurrency(o.budget)}</span>
                <span className="rounded-md bg-brand-orange px-2 py-1 font-bold text-brand-text">Bid →</span>
              </span>
            }
            href={`/opportunities/${o.id}`}
            key={o.id}
            meta={
              <>
                {skills && o.skills.length > 0 && <span className="font-semibold text-brand-text">{skillMatch(skills, o.skills, trained).label} · </span>}
                {o.company} · {o.bidsCloseAt ? <>Bids close <span className="nums">{formatDate(o.bidsCloseAt)}</span></> : <>Client due <span className="nums">{formatDate(o.deadline)}</span></>}
              </>
            }
            title={o.project}
          />
        ))}
      </CardList>
    </TabCard>
  );
}

function EarningsCard({ earnings, onLog }: { earnings: Resource<EarningsSummary>; onLog?: () => void }) {
  const s = earnings.data;
  const logButton = onLog && (
    <Button className="!px-2 !py-0.5 !text-[11px]" onClick={onLog} variant="primary">
      <IconPlus size={12} />
      Log
    </Button>
  );
  return (
    <TabCard
      action={s && s.count > 0 ? logButton : undefined}
      empty={Boolean(s && s.count === 0)}
      emptyAction={
        onLog && (
          <Button className="text-xs" onClick={onLog} variant="primary">
            <IconPlus size={14} />
            Log an earning
          </Button>
        )
      }
      emptyText="No earnings logged yet. Record freelance income here and staff will verify it."
      error={earnings.error}
      href="/earnings"
      icon={<IconEarnings size={13} />}
      loading={earnings.loading}
      onRetry={earnings.retry}
      title="Earnings"
      viewAllLabel="My earnings"
    >
      {s && (
        <div className="space-y-3">
          <Figure label="Verified" value={formatCurrency(s.totalVerified)} />
          <div className="grid grid-cols-2 gap-3">
            <Figure label={`Pending (${s.pendingCount})`} tone="muted" value={formatCurrency(s.totalPending)} />
            <Figure label="Rejected" tone="muted" value={String(s.rejectedCount)} />
          </div>
          <p className="text-[11px] text-brand-text-muted">Only you and verifying staff see these amounts.</p>
        </div>
      )}
    </TabCard>
  );
}
