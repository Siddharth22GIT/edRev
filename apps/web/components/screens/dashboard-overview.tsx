import Link from "next/link";
import { analytics, dashboardMetrics, opportunities } from "@edurev/mock-data";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, formatDate } from "@/lib/format";

export function DashboardOverview() {
  const maxActivity = Math.max(...analytics.weeklyActivity.map((item) => item.value));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Overview"
        title="Good afternoon, Satyam"
        description="A focused view of learner momentum, opportunity flow, and operations health."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard detail="+8 this month" label="Active students" trend="positive" value={String(dashboardMetrics.activeStudents)} />
        <StatCard detail="6 need review" label="Opportunity pipeline" trend="attention" value={String(dashboardMetrics.opportunityPipeline)} />
        <StatCard detail="+12.4% vs. August" label="Monthly earnings" trend="positive" value={formatCurrency(dashboardMetrics.monthlyEarnings)} />
        <StatCard detail="Above 80% target" label="Completion rate" trend="positive" value={`${dashboardMetrics.completionRate}%`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-950">Priority opportunities</h2>
              <p className="mt-1 text-sm text-slate-500">High-fit work ready for the next action.</p>
            </div>
            <Link className="text-sm font-semibold text-blue-600 hover:text-blue-700" href="/opportunities">View all</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {opportunities.slice(0, 3).map((opportunity) => (
              <Link className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between" href={`/opportunities/${opportunity.id}`} key={opportunity.id}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{opportunity.project}</p>
                    <StatusBadge status={opportunity.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{opportunity.company} · Due {formatDate(opportunity.deadline)}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-semibold text-slate-900">{formatCurrency(opportunity.budget)}</p>
                  <p className="text-xs font-medium text-emerald-700">{opportunity.matchScore}% match</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">Weekly activity</h2>
              <p className="mt-1 text-sm text-slate-500">Learner actions completed.</p>
            </div>
            <Badge tone="blue">This week</Badge>
          </div>
          <div className="mt-8 flex h-36 items-end justify-between gap-3">
            {analytics.weeklyActivity.map((item) => (
              <div className="flex flex-1 flex-col items-center gap-2" key={item.label}>
                <span className="w-full rounded-t-md bg-blue-500" style={{ height: `${(item.value / maxActivity) * 100}%` }} title={`${item.value} actions`} />
                <span className="text-xs text-slate-500">{item.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold text-slate-950">Program health</h2>
          <p className="mt-1 text-sm text-slate-500">Snapshot of current learner progress.</p>
          <div className="mt-6 space-y-5">
            <ProgressBar label="Portfolio completion" value={86} />
            <ProgressBar label="Mentor touchpoints" value={73} />
            <ProgressBar label="Proposal readiness" value={64} />
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold text-slate-950">Foundation notes</h2>
          <p className="mt-1 text-sm text-slate-500">The Week 5 workspace is running on controlled mock data.</p>
          <ul className="mt-5 space-y-3 text-sm text-slate-600">
            <li className="flex gap-3"><span className="text-emerald-600">●</span><span>Shared types define the first API contracts.</span></li>
            <li className="flex gap-3"><span className="text-emerald-600">●</span><span>Every navigation route has a presentation-ready screen.</span></li>
            <li className="flex gap-3"><span className="text-emerald-600">●</span><span>Mutations, auth, and a persistent database are intentionally deferred.</span></li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
