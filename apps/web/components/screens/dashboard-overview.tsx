"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { can, type DashboardMetrics, type Opportunity, type Student, type StudentReadinessSummary, type Tier } from "@edurev/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { firstName, greetingFor, HeroBanner } from "@/components/ui/hero-banner";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { currentStage, JourneyStepper, MountainProgress } from "@/components/student/journey";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { roleLabels } from "@/lib/navigation";
import { quickActionsFor, runQuickAction } from "@/lib/quick-actions";
import { useWorkQueue } from "@/lib/work-queue";
import {
  IconAlertTriangle,
  IconAnalytics,
  IconArrowRight,
  IconBriefcase,
  IconCheckCircle,
  IconEarnings,
  IconFileText,
  IconGraduationCap,
  IconPlus,
  IconStudents,
} from "@/components/ui/icons";

const tierRank = (tier: Tier) => Number(tier.split("_")[1]);

/** Role-aware home: what needs the user today, a few key numbers, and shortcuts. */
export function DashboardOverview() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "STUDENT" ? <StudentHome /> : <StaffHome />;
}

/* ------------------------------------------------------------------ */
/* Staff                                                              */
/* ------------------------------------------------------------------ */

interface Task {
  id: string;
  tone: "orange" | "blue" | "green";
  icon: ReactNode;
  title: string;
  items: { label: string; meta?: string; href: string }[];
  href: string;
  cta: string;
}

function StaffHome() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const queue = useWorkQueue();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [checkIns, setCheckIns] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const role = user!.role;
  const supervises = can(role, "STUDENT_SUPERVISE");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboardRes, studentsRes] = await Promise.all([
        apiFetch("/dashboard"),
        supervises ? apiFetch("/students") : Promise.resolve(null),
      ]);
      if (dashboardRes.ok) {
        const json = await dashboardRes.json();
        setMetrics(json?.metrics ?? null);
      } else {
        setError("Couldn't load programme numbers.");
      }
      if (studentsRes?.ok) {
        const json = await studentsRes.json();
        const list: Student[] = Array.isArray(json?.data) ? json.data : [];
        setCheckIns(list.filter((s) => s.status === "ACTIVE" && s.trainingProgress < 60));
      }
    } catch {
      setError("Network error connecting to the API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tasks: Task[] = [];
  if (can(role, "EARNINGS_VERIFY") && queue.pendingEarnings.length > 0) {
    tasks.push({
      id: "verify",
      tone: "orange",
      icon: <IconEarnings size={18} />,
      title: `${queue.pendingEarnings.length} earning${queue.pendingEarnings.length === 1 ? "" : "s"} waiting for verification`,
      items: queue.pendingEarnings.slice(0, 3).map((e) => ({
        label: e.projectTitle || e.platformName,
        meta: formatCurrency(e.convertedAmount),
        href: "/earnings?tab=verify",
      })),
      href: "/earnings?tab=verify",
      cta: "Verify now",
    });
  }
  if (can(role, "OPPORTUNITY_ALLOCATE") && queue.reviewOpportunities.length > 0) {
    tasks.push({
      id: "allocate",
      tone: "blue",
      icon: <IconBriefcase size={18} />,
      title: `${queue.reviewOpportunities.length} opportunit${queue.reviewOpportunities.length === 1 ? "y has" : "ies have"} bids waiting`,
      items: queue.reviewOpportunities.slice(0, 3).map((o) => ({
        label: o.project,
        meta: `${o.numberOfBids} bid${o.numberOfBids === 1 ? "" : "s"}`,
        href: `/opportunities/${o.id}`,
      })),
      href: `/opportunities/${queue.reviewOpportunities[0].id}`,
      cta: "Review & allocate",
    });
  }
  if (queue.reviewProposals.length > 0) {
    tasks.push({
      id: "proposals",
      tone: "blue",
      icon: <IconFileText size={18} />,
      title: `${queue.reviewProposals.length} proposal${queue.reviewProposals.length === 1 ? "" : "s"} in review`,
      items: queue.reviewProposals.slice(0, 3).map((p) => ({ label: p.title, meta: p.studentName, href: "/proposals" })),
      href: "/proposals",
      cta: "Open proposals",
    });
  }
  if (supervises && checkIns.length > 0) {
    tasks.push({
      id: "check-in",
      tone: "green",
      icon: <IconGraduationCap size={18} />,
      title: `${checkIns.length} student${checkIns.length === 1 ? " is" : "s are"} below 60% training`,
      items: checkIns.slice(0, 3).map((s) => ({ label: s.name, meta: `${s.trainingProgress}%`, href: `/students/${s.id}` })),
      href: "/students",
      cta: "Check in",
    });
  }

  const busy = loading || queue.loading;
  const actions = quickActionsFor(role);

  return (
    <div className="space-y-6">
      <HeroBanner
        eyebrow={roleLabels[role]}
        title={`${greetingFor()}, ${firstName(user!.name)}`}
        subtitle={
          busy ? "Checking what needs you…" : tasks.length > 0 ? `${tasks.length} thing${tasks.length === 1 ? "" : "s"} need${tasks.length === 1 ? "s" : ""} your attention today.` : "You're all caught up."
        }
        action={actions.map((action) => (
          <Button className="text-xs" key={action.id} onClick={() => runQuickAction(action, pathname, router.push)} variant="primary">
            <IconPlus size={14} />
            {action.label}
          </Button>
        ))}
      />

      {error && (
        <Card className="flex items-center justify-between border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span>{error}</span>
          <Button className="px-2.5 py-1 text-xs" onClick={load} variant="secondary">
            Retry
          </Button>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="space-y-4 xl:col-span-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#666D7A]">Needs you today</h2>
          {busy ? (
            <Card>
              <SkeletonRows rows={3} />
            </Card>
          ) : tasks.length > 0 ? (
            tasks.map((task) => <TaskCard key={task.id} task={task} />)
          ) : (
            <AllClear />
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#666D7A]">At a glance</h2>
          <KeyNumber icon={<IconStudents size={18} />} label="Active students" loading={loading} value={metrics ? String(metrics.activeStudents) : "0"} />
          <KeyNumber icon={<IconBriefcase size={18} />} label="Open opportunities" loading={loading} value={metrics ? String(metrics.opportunityPipeline) : "0"} />
          <KeyNumber icon={<IconEarnings size={18} />} label="Verified this month" loading={loading} value={metrics ? formatCurrency(metrics.monthlyEarnings) : "₹0"} />
          <Link className="flex items-center justify-between rounded-xl border border-[#E6E6E6] bg-white px-4 py-3 text-sm font-bold text-[#3978B8] shadow-card transition hover:border-[#C2DCF2] hover:bg-[#EFF6FC]" href="/analytics">
            <span className="flex items-center gap-2">
              <IconAnalytics size={16} /> Full analytics
            </span>
            <IconArrowRight size={16} />
          </Link>
        </section>
      </div>
    </div>
  );
}

const toneStyles: Record<Task["tone"], string> = {
  orange: "bg-[#FEF6EE] text-[#C27803] ring-[#FBD7B3]",
  blue: "bg-[#EFF6FC] text-[#2F659C] ring-[#C2DCF2]",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

function TaskCard({ task }: { task: Task }) {
  return (
    <Card className="p-5 transition hover:shadow-cardHover">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${toneStyles[task.tone]}`}>{task.icon}</span>
          <div>
            <h3 className="font-bold text-[#30343B]">{task.title}</h3>
            <ul className="mt-2 space-y-1">
              {task.items.map((item) => (
                <li key={`${item.href}-${item.label}`}>
                  <Link className="group flex items-center gap-2 text-xs text-[#666D7A] hover:text-[#3978B8]" href={item.href}>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#D1D5DB] group-hover:bg-[#3978B8]" />
                    <span className="font-semibold text-[#30343B] group-hover:text-[#3978B8]">{item.label}</span>
                    {item.meta && <span>· {item.meta}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Link className="shrink-0" href={task.href}>
          <Button className="w-full text-xs sm:w-auto" variant="primary">
            {task.cta}
            <IconArrowRight size={14} />
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function AllClear() {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      <svg aria-hidden="true" className="h-16 w-28" viewBox="0 0 112 64">
        <path d="M30 64 L74 14 L112 64 Z" fill="#C2DCF2" />
        <path d="M0 64 L44 18 L84 64 Z" fill="#30343B" />
        <path d="M44 18 L37 26 L41 25 L44 28 L48 24 L51 26 Z" fill="#FEF6EE" />
      </svg>
      <p className="mt-3 font-bold text-[#30343B]">All clear</p>
      <p className="mt-1 max-w-sm text-sm text-[#666D7A]">Nothing is waiting for you right now. New items will show up here as soon as they arrive.</p>
    </Card>
  );
}

function KeyNumber({ icon, label, value, loading }: { icon: ReactNode; label: string; value: string; loading: boolean }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F7F7F6] text-[#3978B8] ring-1 ring-[#E6E6E6]">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#666D7A]">{label}</p>
        {loading ? <Skeleton className="mt-1.5 h-6 w-20" /> : <p className="text-xl font-extrabold text-[#30343B]">{value}</p>}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Student                                                            */
/* ------------------------------------------------------------------ */

function StudentHome() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const [readiness, setReadiness] = useState<StudentReadinessSummary | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const studentId = user!.studentId || user!.id;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [readinessRes, oppRes] = await Promise.all([apiFetch(`/students/${studentId}/readiness`), apiFetch("/opportunities")]);
      if (readinessRes.ok) setReadiness((await readinessRes.json()).data ?? null);
      else setError("Couldn't load your readiness profile.");
      if (oppRes.ok) {
        const json = await oppRes.json();
        setOpportunities(Array.isArray(json?.data) ? json.data : []);
      }
    } catch {
      setError("Network error connecting to the API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const student = readiness?.student;
  const matching = student
    ? opportunities
        .filter((o) => o.status !== "ALLOCATED" && o.status !== "CLOSED" && tierRank(student.tier) >= tierRank(o.requiredTier))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 3)
    : [];
  const nextModule = readiness?.training.modules.find((m) => m.status !== "COMPLETED");
  const blocked = readiness && !readiness.safeguardCheck.eligible;
  const hoursLeft = readiness?.hours ? Math.max(0, readiness.hours.allowedHours - readiness.hours.loggedHours) : null;
  const logEarning = quickActionsFor(user!.role).find((a) => a.id === "new-earning");

  const nextStep = blocked
    ? { tone: "red" as const, title: "Action needed before you can be allocated work", detail: readiness!.safeguardCheck.reasons[0], href: `/students/${studentId}`, cta: "View my profile" }
    : nextModule
      ? { tone: "orange" as const, title: `Continue “${nextModule.title}”`, detail: `${nextModule.completionPercentage}% complete · training builds your readiness`, href: `/students/${studentId}`, cta: "Open training" }
      : matching[0]
        ? { tone: "orange" as const, title: `Bid on “${matching[0].project}”`, detail: `${matching[0].company} · ${formatCurrency(matching[0].budget)} · matches your tier`, href: `/opportunities/${matching[0].id}`, cta: "Place a bid" }
        : { tone: "orange" as const, title: "Browse open opportunities", detail: "New client work is published regularly.", href: "/opportunities", cta: "Browse" };

  return (
    <div className="space-y-6">
      <HeroBanner
        eyebrow="Your workspace"
        title={`${greetingFor()}, ${firstName(user!.name)}`}
        subtitle={student ? `Official tier ${student.tier.replace("_", " ")} · ${readiness!.training.progressPercentage}% training complete` : "Loading your progress…"}
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

      {error && (
        <Card className="flex items-center justify-between border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span>{error}</span>
          <Button className="px-2.5 py-1 text-xs" onClick={load} variant="secondary">
            Retry
          </Button>
        </Card>
      )}

      {/* Next step */}
      {loading ? (
        <Card className="p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-3 h-3 w-1/2" />
        </Card>
      ) : (
        <Card className={`p-5 ${nextStep.tone === "red" ? "border-rose-200 bg-rose-50/60" : "border-[#FBD7B3] bg-[#FEF6EE]/60"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${nextStep.tone === "red" ? "bg-rose-100 text-rose-700" : "bg-[#F2A65A] text-white"}`}>
                {nextStep.tone === "red" ? <IconAlertTriangle size={18} /> : <IconArrowRight size={18} />}
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#C27803]">Your next step</p>
                <h2 className="mt-0.5 font-bold text-[#30343B]">{nextStep.title}</h2>
                <p className="mt-0.5 text-xs text-[#666D7A]">{nextStep.detail}</p>
              </div>
            </div>
            <Link className="shrink-0" href={nextStep.href}>
              <Button className="w-full text-xs sm:w-auto" variant="primary">
                {nextStep.cta}
                <IconArrowRight size={14} />
              </Button>
            </Link>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-bold text-[#30343B]">Your journey</h2>
          <div className="mt-4">
            {student ? <JourneyStepper stage={currentStage(student, readiness!.training.progressPercentage)} /> : <Skeleton className="h-14 w-full" />}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-bold text-[#30343B]">Tier climb</h2>
          <div className="mt-3">
            {student ? <MountainProgress progress={readiness!.training.progressPercentage} tier={student.tier} /> : <Skeleton className="h-24 w-full" />}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between border-b border-[#E6E6E6] px-5 py-4">
            <h2 className="font-bold text-[#30343B]">Opportunities for your tier</h2>
            <Link className="inline-flex items-center gap-1 text-xs font-bold text-[#3978B8] hover:text-[#2F659C]" href="/opportunities">
              See all <IconArrowRight size={14} />
            </Link>
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : matching.length > 0 ? (
            <div className="divide-y divide-[#E6E6E6]">
              {matching.map((o) => (
                <Link className="group flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-[#F7F7F6]" href={`/opportunities/${o.id}`} key={o.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-[#30343B] group-hover:text-[#3978B8]">{o.project}</p>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-[#666D7A]">
                      {o.company} · Due {formatDate(o.deadline)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-[#FEF6EE] px-2.5 py-1 text-xs font-bold text-[#C27803] ring-1 ring-[#FBD7B3] transition group-hover:bg-[#F2A65A] group-hover:text-[#30343B]">
                    Bid →
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-[#666D7A]">No open opportunities match your tier right now.</p>
          )}
        </Card>

        <div className="space-y-4">
          <KeyNumber icon={<IconGraduationCap size={18} />} label="Official tier" loading={loading} value={student ? student.tier.replace("_", " ") : "–"} />
          <KeyNumber icon={<IconCheckCircle size={18} />} label="Training complete" loading={loading} value={readiness ? `${readiness.training.progressPercentage}%` : "–"} />
          <KeyNumber icon={<IconBriefcase size={18} />} label="Work hours left this week" loading={loading} value={hoursLeft === null ? "–" : `${hoursLeft}h`} />
          {readiness?.blackoutActive && <Badge tone="red">Exam blackout active: no new allocations</Badge>}
        </div>
      </div>
    </div>
  );
}
