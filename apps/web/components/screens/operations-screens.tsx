import { analytics, earnings, proposals, safeguards, settings } from "@edurev/mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, formatDate } from "@/lib/format";

export function EarningsScreen() {
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Finance" title="Earnings" description="A high-level reconciliation view. Payouts and transaction operations are not part of the Week 5 build." action={<Button variant="secondary">Export summary</Button>} />
      <div className="grid gap-4 md:grid-cols-3"><StatCard detail={`${earnings.period} gross income`} label="Gross earnings" value={formatCurrency(earnings.gross)} /><StatCard detail="10% platform allocation" label="Platform fees" trend="attention" value={`−${formatCurrency(earnings.platformFees)}`} /><StatCard detail={`+${earnings.change}% vs. last month`} label="Net earnings" trend="positive" value={formatCurrency(earnings.net)} /></div>
      <Card className="p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h2 className="font-semibold text-slate-950">September snapshot</h2><p className="mt-1 text-sm text-slate-500">A placeholder reporting card for the eventual financial ledger.</p></div><Badge tone="blue">Mock data</Badge></div><div className="mt-7 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-l-full bg-blue-600" style={{ width: "90%" }} /><div /></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>Gross: {formatCurrency(earnings.gross)}</span><span>Net: {formatCurrency(earnings.net)}</span></div></Card>
    </div>
  );
}

export function ProposalsScreen() {
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Placement" title="Proposals" description="Track draft and submitted proposals before the approval and delivery workflow is introduced." action={<Button>+ New proposal</Button>} />
      <Card><DataTable columns={["Proposal", "Student", "Submitted", "Value", "Status"]}>{proposals.map((proposal) => <tr className="transition hover:bg-slate-50" key={proposal.id}><td className="px-5 py-4"><p className="font-semibold text-slate-900">{proposal.title}</p><p className="mt-1 text-xs text-slate-500">{proposal.opportunityId}</p></td><td className="px-5 py-4 text-slate-600">{proposal.studentName}</td><td className="px-5 py-4 text-slate-600">{proposal.submittedAt ? formatDate(proposal.submittedAt) : "Not submitted"}</td><td className="px-5 py-4 font-medium text-slate-800">{formatCurrency(proposal.value)}</td><td className="px-5 py-4"><StatusBadge status={proposal.status} /></td></tr>)}</DataTable></Card>
    </div>
  );
}

export function SafeguardsScreen() {
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Operations" title="Safeguards" description="A visible home for learner and operations controls. Automation and alerts come in a later release." />
      <div className="grid gap-5 lg:grid-cols-3">{safeguards.map((safeguard) => <Card className="p-5" key={safeguard.id}><div className="flex items-start justify-between gap-3"><h2 className="font-semibold text-slate-950">{safeguard.name}</h2><StatusBadge status={safeguard.status} /></div><p className="mt-3 text-sm leading-6 text-slate-600">{safeguard.description}</p><dl className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Owner</dt><dd className="font-medium text-slate-700">{safeguard.owner}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Last checked</dt><dd className="font-medium text-slate-700">{formatDate(safeguard.lastCheckedAt)}</dd></div></dl></Card>)}</div>
      <Card className="p-5"><h2 className="font-semibold text-slate-950">Week 5 boundary</h2><p className="mt-2 text-sm leading-6 text-slate-600">These cards establish the risk vocabulary and ownership model. No rules engine, messaging, or automatic enforcement is active yet.</p></Card>
    </div>
  );
}

export function AnalyticsScreen() {
  const maxValue = Math.max(...analytics.weeklyActivity.map((item) => item.value));
  return (
    <div className="space-y-7"><PageHeader eyebrow="Reporting" title="Analytics" description="A compact reporting frame for the metrics that will be sourced from production events later." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard detail="Learners placed in work" label="Placement rate" trend="positive" value={`${analytics.placementRate}%`} /><StatCard detail="Submitted proposals accepted" label="Proposal win rate" value={`${analytics.proposalWinRate}%`} /><StatCard detail="Median client response" label="Response time" value={`${analytics.averageResponseHours}h`} /><StatCard detail="Across active cohorts" label="Learner satisfaction" trend="positive" value={`${analytics.learnerSatisfaction}/5`} /></div><Card className="p-6"><div className="flex items-start justify-between"><div><h2 className="font-semibold text-slate-950">Learner actions</h2><p className="mt-1 text-sm text-slate-500">Activity captured during the current working week.</p></div><Badge tone="blue">Mock series</Badge></div><div className="mt-8 flex h-52 items-end justify-between gap-3 border-b border-slate-100 pb-0">{analytics.weeklyActivity.map((item) => <div className="flex flex-1 flex-col items-center gap-3" key={item.label}><span className="text-xs font-semibold text-slate-600">{item.value}</span><span className="w-full max-w-16 rounded-t-md bg-gradient-to-t from-blue-600 to-sky-400" style={{ height: `${(item.value / maxValue) * 100}%` }} /><span className="text-xs text-slate-500">{item.label}</span></div>)}</div></Card></div>
  );
}

export function SettingsScreen() {
  return (
    <div className="space-y-7"><PageHeader eyebrow="Workspace" title="Settings" description="Organization defaults are presented here; saving and permissions are intentionally out of scope for Week 5." /><Card className="max-w-3xl p-6"><form className="space-y-6"><div><label className="block text-sm font-semibold text-slate-700" htmlFor="organization-name">Organization name</label><input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" defaultValue={settings.organizationName} id="organization-name" /></div><div><label className="block text-sm font-semibold text-slate-700" htmlFor="notification-email">Notification email</label><input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" defaultValue={settings.notificationEmail} id="notification-email" type="email" /></div><div><label className="block text-sm font-semibold text-slate-700" htmlFor="timezone">Timezone</label><select className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" defaultValue={settings.timezone} id="timezone"><option>Asia/Kolkata</option><option>Europe/London</option><option>America/New_York</option></select></div><label className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"><span><span className="block text-sm font-semibold text-slate-800">Weekly digest</span><span className="mt-1 block text-xs text-slate-500">Receive the operations summary by email.</span></span><input className="h-4 w-4 accent-blue-600" defaultChecked={settings.weeklyDigestEnabled} type="checkbox" /></label><Button type="button">Save changes</Button></form></Card></div>
  );
}
