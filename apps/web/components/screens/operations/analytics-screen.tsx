"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnalyticsSnapshot, DashboardMetrics } from "@edurev/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RequirePermission } from "@/components/ui/require-permission";
import { TIER_STYLES, TierBadge } from "@/components/ui/tier-badge";
import { StatCard } from "@/components/ui/stat-card";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/format";
import { IconCheckCircle, IconClock, IconGraduationCap, IconProposals, IconUserCheck } from "@/components/ui/icons";

export function AnalyticsScreen() {
  return (
    <RequirePermission
      action={{ href: "/dashboard", label: "Back to my dashboard" }}
      description="Programme analytics is institutional reporting for staff. Your own progress is on your dashboard and profile."
      permission="ANALYTICS_VIEW"
      title="Analytics is for staff"
    >
      <AnalyticsContent />
    </RequirePermission>
  );
}

function AnalyticsContent() {
  const { user, isLoading: authLoading } = useAuth();
  const { apiFetch } = useApi();
  const [data, setData] = useState<AnalyticsSnapshot | null>(null);
  // Programme health figures (moved here from the dashboard, which now focuses on actions)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, dashboardRes] = await Promise.all([apiFetch("/analytics"), apiFetch("/dashboard")]);
      if (dashboardRes.ok) {
        const dashboardJson = await dashboardRes.json();
        if (dashboardJson?.metrics) setMetrics(dashboardJson.metrics);
      }
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setData(json.data);
        }
      } else if (res.status === 401) {
        setError("Authentication required to view institutional analytics.");
      } else {
        const json = await res.json().catch(() => null);
        setError(json?.message || "Unable to fetch analytics.");
      }
    } catch {
      setError("Network error connecting to analytics service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      loadAnalytics();
    }
  }, [authLoading]);

  const activityList = data?.weeklyActivity || [];
  const maxValue = Math.max(1, ...activityList.map((item) => item.value));
  const totalWeeklyActions = activityList.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Executive Institutional Reporting"
        title="Programme Analytics"
        description="Dynamic institutional metrics computed directly from learner workflow, allocations, and verified ledger events."
      />

      {!user && !authLoading && (
        <Card className="p-4 bg-[#FEF6EE] border-[#FBD7B3] text-[#30343B] text-sm flex items-center justify-between">
          <span>You are viewing in guest mode. Sign in to view live authenticated analytics.</span>
          <Link className="font-bold text-[#C27803] hover:underline" href="/login">
            Sign In →
          </Link>
        </Card>
      )}

      {error && (
        <Card className="p-4 bg-rose-50 border-rose-200 text-rose-800 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button className="text-xs px-2.5 py-1" onClick={loadAnalytics} variant="secondary">
            Retry
          </Button>
        </Card>
      )}

      {/* Top Aggregate Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          detail="Allocated in active client work"
          label="Placement Rate"
          trend="positive"
          accent="blue"
          icon={<IconUserCheck size={18} />}
          value={loading ? "…" : data ? `${data.placementRate}%` : "0%"}
        />
        <StatCard
          detail="Submitted proposals accepted"
          label="Proposal Win Rate"
          trend="positive"
          accent="orange"
          icon={<IconProposals size={18} />}
          value={loading ? "…" : data ? `${data.proposalWinRate}%` : "0%"}
        />
        <StatCard
          detail="Median client response SLA"
          label="SLA Response Time"
          accent="emerald"
          icon={<IconClock size={18} />}
          value={
            loading
              ? "…"
              : data?.averageResponseHours !== null && data?.averageResponseHours !== undefined
              ? `${data.averageResponseHours}h`
              : "N/A"
          }
        />
        <StatCard
          detail="Institutional benchmark: 4.5/5"
          label="Learner Satisfaction"
          accent="amber"
          icon={<IconGraduationCap size={18} />}
          value={
            loading
              ? "…"
              : data?.learnerSatisfaction !== null && data?.learnerSatisfaction !== undefined
              ? `${data.learnerSatisfaction}/5`
              : "N/A"
          }
        />
      </div>

      {/* Programme Health */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-[#30343B] text-base">Programme Health</h2>
            <p className="mt-0.5 text-xs text-[#666D7A]">Cohort readiness across all active learners.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="blue">{metrics ? metrics.activeStudents : "…"} active students</Badge>
            <Badge tone="orange">{metrics ? metrics.totalBids : "…"} bids · {metrics ? metrics.allocations : "…"} allocations</Badge>
            <Badge tone="green">{metrics ? formatCurrency(metrics.verifiedEarnings) : "…"} verified to date</Badge>
          </div>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          <ProgressBar tone="orange" label="Training completion" value={metrics?.completionRate ?? 0} />
          <ProgressBar tone="blue" label="Academic compliance" value={metrics?.complianceRate ?? 0} />
          <ProgressBar
            tone="emerald"
            label="Bids allocated"
            value={metrics && metrics.totalBids > 0 ? Math.min(100, Math.round((metrics.allocations / metrics.totalBids) * 100)) : 0}
          />
        </div>
      </Card>

      {/* Activity & Cohort Tier Breakdown */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Weekly Activity Bar Chart */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-[#30343B] text-base">Learner Activity Timeline</h2>
              <p className="mt-0.5 text-xs text-[#666D7A]">
                Workflow action events (bids, proposals, allocations, and earnings submissions) recorded this week.
              </p>
            </div>
            <Badge tone="orange">{totalWeeklyActions} Actions Logged</Badge>
          </div>

          <div className="mt-8 flex h-52 items-end justify-between gap-3 border-b border-[#E6E6E6] pb-2">
            {activityList.map((item) => {
              const isPeak = item.value === maxValue && item.value > 0;
              return (
                <div className="flex flex-1 flex-col items-center gap-2 h-full justify-end" key={item.label}>
                  <span className="text-[11px] font-bold text-[#30343B]">{item.value}</span>
                  <span
                    className={`w-full max-w-14 rounded-t-md transition-all duration-300 ${
                      isPeak ? "bg-[#F2A65A]" : "bg-[#3978B8]"
                    }`}
                    style={{
                      height: `${item.value > 0 ? (item.value / maxValue) * 100 : 4}%`,
                      minHeight: item.value > 0 ? "16px" : "4px",
                    }}
                    title={`${item.value} actions on ${item.date || item.label}`}
                  />
                  <span className="text-xs font-bold text-[#666D7A]">{item.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-[#8C93A0]">
            <span>Monday</span>
            <span className="font-semibold text-[#666D7A]">Current Monday–Sunday Working Window</span>
            <span>Sunday</span>
          </div>
        </Card>

        {/* Students by Tier Distribution */}
        <Card className="p-6">
          <div className="flex items-center justify-between border-b border-[#E6E6E6] pb-3 mb-4">
            <div>
              <h2 className="font-bold text-[#30343B] text-base">Cohort by Tier</h2>
              <p className="text-xs text-[#666D7A]">Enrolled student tier distribution</p>
            </div>
            <Badge tone="blue">
              {data?.studentsByTier ? data.studentsByTier.reduce((acc, curr) => acc + curr.count, 0) : 0} Total
            </Badge>
          </div>

          <div className="space-y-4">
            {data?.studentsByTier && data.studentsByTier.length > 0 ? (
              data.studentsByTier.map((t) => {
                const totalStudents = data.studentsByTier.reduce((acc, curr) => acc + curr.count, 0);
                const pct = totalStudents > 0 ? Math.round((t.count / totalStudents) * 100) : 0;
                return (
                  <div className="space-y-1.5" key={t.tier}>
                    <div className="flex items-center justify-between text-xs">
                      <TierBadge tier={t.tier} />
                      <span className="text-[#666D7A]">
                        <strong className="text-[#30343B]">{t.count}</strong> ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#E6E6E6] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${TIER_STYLES[t.tier]?.bar ?? "bg-[#3978B8]"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-4 text-center text-xs text-[#8C93A0]">No tier distribution data available.</p>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] p-3 text-xs leading-5 text-[#666D7A]">
            Official tier progression is audited strictly through student training completion and verified earnings.
          </div>
        </Card>
      </div>

      {/* Institutional Privacy & Double-Counting Safeguards Note */}
      <Card className="p-5 bg-white border-[#E6E6E6] shadow-card">
        <div className="flex items-center gap-2">
          <span className="text-[#3978B8]">
            <IconCheckCircle size={18} />
          </span>
          <h3 className="text-sm font-bold text-[#30343B]">Privacy Safeguards & Double-Counting Protection</h3>
        </div>
        <p className="mt-2 text-xs leading-5 text-[#666D7A]">
          In strict compliance with institutional safeguards, all analytics metrics represent aggregate macro data.
          Individual student earnings are private, and public leaderboards are prohibited. Financial metrics only
          include officially verified records from the institutional ledger to prevent double-counting.
        </p>
      </Card>
    </div>
  );
}
