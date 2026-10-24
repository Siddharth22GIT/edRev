"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DashboardMetrics, Opportunity } from "@edurev/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/format";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

import {
  IconAnalytics,
  IconArrowUpRight,
  IconCheckCircle,
  IconClock,
  IconEarnings,
  IconGraduationCap,
  IconOpportunities,
  IconSafeguards,
  IconStudents,
  IconUserCheck,
} from "@/components/ui/icons";

export function DashboardOverview() {
  const { user, getAuthHeaders, isLoading: authLoading } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentOpportunities, setRecentOpportunities] = useState<Opportunity[]>([]);
  const [weeklyActivity, setWeeklyActivity] = useState<Array<{ label: string; date?: string; value: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = getAuthHeaders();
      const res = await fetch(`${API_BASE}/dashboard`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json?.metrics) {
          setMetrics(json.metrics);
        }
        if (json?.recentOpportunities && Array.isArray(json.recentOpportunities)) {
          setRecentOpportunities(json.recentOpportunities);
        }
        if (json?.weeklyActivity && Array.isArray(json.weeklyActivity)) {
          setWeeklyActivity(json.weeklyActivity);
        }
      } else if (res.status === 401) {
        setError("Sign in required to view live operational metrics.");
      } else {
        const json = await res.json().catch(() => null);
        setError(json?.message || "Failed to load dashboard metrics.");
      }
    } catch {
      setError("Network error connecting to operations API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      loadDashboard();
    }
  }, [authLoading]);

  const maxActivity = Math.max(1, ...weeklyActivity.map((item) => item.value));
  const totalWeeklyActions = weeklyActivity.reduce((acc, curr) => acc + curr.value, 0);

  const roleLabels: Record<string, string> = {
    STUDENT: "Learner / Student",
    BID_DESK_ANALYST: "Bid Desk Analyst",
    PROPOSAL_EDITOR: "Proposal Editor",
    GUILD_LEAD: "Guild Lead / Mentor",
    CELL_COORDINATOR: "Cell Coordinator",
    FACULTY_DIRECTOR: "Faculty Director",
    PLACEMENT_OFFICE: "Placement Office",
    DEAN: "Dean of Academic Affairs",
    ADMINISTRATOR: "System Administrator",
  };

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          eyebrow="Academic Institutional Portal"
          title={user ? `Welcome back, ${user.name}` : "Good afternoon, Operations Team"}
          description="A centralized view of learner momentum, opportunity flow, and institutional safeguard health."
        />
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#666D7A]">Active Role:</span>
            <Badge tone="orange">{roleLabels[user.role] || user.role}</Badge>
          </div>
        )}
      </div>

      {!user && !authLoading && (
        <Card className="p-4 bg-[#FEF6EE] border-[#FBD7B3] text-[#30343B] text-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[#C27803] font-bold">ℹ</span>
            <span>You are viewing in public view mode. Sign in to access your role-specific authenticated workspace.</span>
          </div>
          <Link className="font-bold text-[#C27803] hover:underline" href="/login">
            Sign In to Account →
          </Link>
        </Card>
      )}

      {error && (
        <Card className="p-4 bg-rose-50 border-rose-200 text-rose-800 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button className="text-xs px-2.5 py-1" onClick={loadDashboard} variant="secondary">
            Retry
          </Button>
        </Card>
      )}

      {/* Role-Specific Focus Banner */}
      {user && (
        <Card className="border-[#E6E6E6] bg-gradient-to-r from-white via-white to-[#FEF6EE]/40 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#3978B8]">
                <IconUserCheck size={14} /> Role Focus & Workflow Priority
              </span>
              <h3 className="text-base font-bold text-[#30343B]">
                {user.role === "STUDENT"
                  ? "Explore Open Opportunities & Track Milestone Earnings"
                  : user.role === "BID_DESK_ANALYST"
                  ? "Manage Opportunity Pipeline & Review Learner Bids"
                  : user.role === "CELL_COORDINATOR" || user.role === "FACULTY_DIRECTOR"
                  ? "Review Pending Earning Verifications & Academic Quotas"
                  : "Institutional Governance, Safeguards & Cohort Progression"}
              </h3>
              <p className="text-xs text-[#666D7A]">
                {user.role === "STUDENT"
                  ? "Submit proposals with attached documents, check allocation updates, and record proof of payment."
                  : user.role === "BID_DESK_ANALYST"
                  ? "Evaluate proposal rubrics, enforce institutional SLA commitments, and allocate work to verified students."
                  : user.role === "CELL_COORDINATOR" || user.role === "FACULTY_DIRECTOR"
                  ? "Inspect student payment proofs, issue remarks, approve verified earnings, and maintain CGPA compliance."
                  : "Monitor cross-cohort analytics, safeguard health, platform settings, and verified institutional revenue."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <Link href="/opportunities">
                <Button variant="primary" className="text-xs">
                  Browse Opportunities
                </Button>
              </Link>
              <Link href="/earnings">
                <Button variant="secondary" className="text-xs">
                  Ledger & Earnings
                </Button>
              </Link>
              {(user.role === "ADMINISTRATOR" || user.role === "DEAN" || user.role === "CELL_COORDINATOR") && (
                <Link href="/analytics">
                  <Button variant="blue" className="text-xs">
                    Live Analytics
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Top Level Metric StatCards with LPU Colors */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          detail="Enrolled in active cohorts"
          label="Active Students"
          trend="positive"
          accent="blue"
          icon={<IconStudents size={18} />}
          value={loading ? "…" : metrics ? String(metrics.activeStudents) : "0"}
        />
        <StatCard
          detail="Open & under review"
          label="Opportunity Pipeline"
          trend="attention"
          accent="orange"
          icon={<IconOpportunities size={18} />}
          value={loading ? "…" : metrics ? String(metrics.opportunityPipeline) : "0"}
        />
        <StatCard
          detail="Current calendar month"
          label="Verified Monthly Earnings"
          trend="positive"
          accent="emerald"
          icon={<IconEarnings size={18} />}
          value={loading ? "…" : metrics ? formatCurrency(metrics.monthlyEarnings) : "₹0"}
        />
        <StatCard
          detail="Cohort training average"
          label="Completion Rate"
          trend="positive"
          accent="amber"
          icon={<IconGraduationCap size={18} />}
          value={loading ? "…" : metrics ? `${metrics.completionRate}%` : "0%"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Priority Opportunities List */}
        <Card className="xl:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#E6E6E6] bg-white px-5 py-4">
            <div>
              <h2 className="font-bold text-[#30343B] text-base">Priority Opportunities</h2>
              <p className="mt-0.5 text-xs text-[#666D7A]">Live curated enterprise opportunities staged for bidding and allocation.</p>
            </div>
            <Link className="inline-flex items-center gap-1 text-xs font-bold text-[#3978B8] hover:text-[#2F659C] transition" href="/opportunities">
              <span>View all</span>
              <IconArrowUpRight size={14} />
            </Link>
          </div>
          <div className="divide-y divide-[#E6E6E6] bg-white">
            {recentOpportunities.length > 0 ? (
              recentOpportunities.map((opportunity) => (
                <Link
                  className="group flex flex-col gap-3 px-5 py-4 transition hover:bg-[#F7F7F6] sm:flex-row sm:items-center sm:justify-between"
                  href={`/opportunities/${opportunity.id}`}
                  key={opportunity.id}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-[#30343B] group-hover:text-[#3978B8] transition">
                        {opportunity.project}
                      </p>
                      <StatusBadge status={opportunity.status} />
                    </div>
                    <p className="mt-1 text-xs text-[#666D7A]">
                      {opportunity.company} · Due {formatDate(opportunity.deadline)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-extrabold text-[#30343B]">{formatCurrency(opportunity.budget)}</p>
                    <p className="text-xs font-semibold text-emerald-700">{opportunity.matchScore}% match</p>
                  </div>
                </Link>
              ))
            ) : (
              <p className="p-8 text-center text-xs text-[#8C93A0]">
                {loading ? "Loading live opportunities…" : "No opportunities currently staged."}
              </p>
            )}
          </div>
        </Card>

        {/* Weekly Activity Chart */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-[#30343B] text-base">Weekly Activity</h2>
                <p className="mt-0.5 text-xs text-[#666D7A]">Workflow actions completed this week.</p>
              </div>
              <Badge tone="orange">{totalWeeklyActions} actions</Badge>
            </div>
            <div className="mt-8 flex h-36 items-end justify-between gap-3 border-b border-[#E6E6E6] pb-2">
              {weeklyActivity.length > 0 ? (
                weeklyActivity.map((item, idx) => {
                  const isTop = item.value === maxActivity && item.value > 0;
                  return (
                    <div className="flex flex-1 flex-col items-center gap-2 h-full justify-end" key={item.label}>
                      <span
                        className={`w-full rounded-t-md transition-all duration-300 ${
                          isTop ? "bg-[#F2A65A]" : "bg-[#3978B8]"
                        }`}
                        style={{
                          height: `${item.value > 0 ? (item.value / maxActivity) * 100 : 4}%`,
                          minHeight: item.value > 0 ? "8px" : "3px",
                        }}
                        title={`${item.value} actions`}
                      />
                      <span className="text-[11px] font-bold text-[#666D7A]">{item.label}</span>
                    </div>
                  );
                })
              ) : (
                <p className="w-full py-10 text-center text-xs text-[#8C93A0]">
                  {loading ? "Loading weekly actions…" : "No activity recorded this week."}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-[#666D7A]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#F2A65A]" /> Peak Action Day
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#3978B8]" /> Standard Workflow
            </span>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Program Health Bars */}
        <Card className="p-6">
          <h2 className="font-bold text-[#30343B] text-base">Program Health & Cohort Readiness</h2>
          <p className="mt-0.5 text-xs text-[#666D7A]">Live operational snapshot across all active learner cohorts.</p>
          <div className="mt-6 space-y-5">
            <ProgressBar tone="orange" label="Portfolio & Training Completion Rate" value={metrics?.completionRate ?? 0} />
            <ProgressBar tone="blue" label="Academic Safeguards Compliance Rate" value={metrics?.complianceRate ?? 0} />
            <ProgressBar
              tone="emerald"
              label="Work Allocation Readiness"
              value={metrics ? Math.min(100, Math.round((metrics.totalBids > 0 ? (metrics.allocations / metrics.totalBids) * 100 : 0))) : 0}
            />
          </div>
        </Card>

        {/* Institutional Safeguards & Operations Note */}
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FC] text-[#3978B8] border border-[#C2DCF2]">
              <IconSafeguards size={18} />
            </div>
            <div>
              <h2 className="font-bold text-[#30343B] text-base">Institutional Governance & Verification</h2>
              <p className="text-xs text-[#666D7A]">Database-backed integrity and compliance standards.</p>
            </div>
          </div>
          <ul className="mt-5 space-y-3.5 text-sm text-[#30343B]">
            <li className="flex items-start gap-3 rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/50 p-3">
              <span className="mt-0.5 text-[#3978B8]">
                <IconCheckCircle size={16} />
              </span>
              <div>
                <strong className="text-[#30343B] text-xs uppercase tracking-wide block">Academic Safeguards Gate</strong>
                <p className="text-xs text-[#666D7A] mt-0.5">Automated validation of CGPA thresholds, 20 hr/wk quota caps, and blackout exam protection.</p>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/50 p-3">
              <span className="mt-0.5 text-[#C27803]">
                <IconEarnings size={16} />
              </span>
              <div>
                <strong className="text-[#30343B] text-xs uppercase tracking-wide block">Audited Verified Ledger</strong>
                <p className="text-xs text-[#666D7A] mt-0.5">
                  Reported earnings reflect authentic verified transactions (Total: {metrics ? formatCurrency(metrics.verifiedEarnings) : "₹0"}).
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/50 p-3">
              <span className="mt-0.5 text-emerald-600">
                <IconClock size={16} />
              </span>
              <div>
                <strong className="text-[#30343B] text-xs uppercase tracking-wide block">Privacy & SLA Governance</strong>
                <p className="text-xs text-[#666D7A] mt-0.5">Strict learner financial isolation with enforced 72-hour institutional allocation SLA commitments.</p>
              </div>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
