import Link from "next/link";
import { getOpportunity, opportunities } from "@edurev/mock-data";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { BidDesk } from "@/components/opportunities/bid-desk";

export function OpportunitiesScreen() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Pipeline"
        title="Opportunities"
        description="Curated client work is staged here before it moves into proposals and placement."
        action={<Button>+ Add opportunity</Button>}
      />
      {opportunities.length === 0 ? <EmptyState description="New opportunities will appear here once the source integration is connected." title="No opportunities yet" /> : (
        <Card>
          <DataTable columns={["Opportunity", "Category", "Deadline", "Budget", "Match", "Status", ""]}>
            {opportunities.map((opportunity) => (
              <tr className="transition hover:bg-slate-50" key={opportunity.id}>
                <td className="px-5 py-4"><Link className="font-semibold text-slate-900 hover:text-blue-600" href={`/opportunities/${opportunity.id}`}>{opportunity.project}</Link><p className="mt-1 text-xs text-slate-500">{opportunity.company}</p></td>
                <td className="px-5 py-4 text-slate-600">{opportunity.category}</td>
                <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDate(opportunity.deadline)}</td>
                <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-800">{formatCurrency(opportunity.budget)}</td>
                <td className="whitespace-nowrap px-5 py-4"><Badge tone="green">{opportunity.matchScore}%</Badge></td>
                <td className="px-5 py-4"><StatusBadge status={opportunity.status} /></td>
                <td className="px-5 py-4 text-right"><Link aria-label={`View ${opportunity.project}`} className="font-semibold text-blue-600" href={`/opportunities/${opportunity.id}`}>View →</Link></td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}
    </div>
  );
}

export function OpportunityDetailScreen({ id }: { id: string }) {
  const opportunity = getOpportunity(id);
  if (!opportunity) notFound();

  return (
    <div className="space-y-7">
      <Link className="inline-flex text-sm font-semibold text-slate-600 hover:text-blue-600" href="/opportunities">← All opportunities</Link>
      <PageHeader
        eyebrow={opportunity.company}
        title={opportunity.project}
        description={opportunity.description}
        action={<Button>Start proposal</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={opportunity.status} /><Badge tone="blue">{opportunity.category}</Badge></div>
          <h2 className="mt-6 text-lg font-semibold text-slate-950">Expected deliverables</h2>
          <ul className="mt-4 space-y-3">
            {opportunity.deliverables.map((deliverable) => <li className="flex gap-3 text-sm text-slate-600" key={deliverable}><span className="text-blue-600">✓</span>{deliverable}</li>)}
          </ul>
          <div className="mt-8 border-t border-slate-100 pt-6"><h2 className="font-semibold text-slate-950">Foundation note</h2><p className="mt-2 text-sm leading-6 text-slate-600">This detail view is backed by mock data. Assignment and proposal workflows will be added after the Week 5 shell is validated.</p></div>
        </Card>
        <Card className="h-fit p-6">
          <h2 className="font-semibold text-slate-950">At a glance</h2>
          <dl className="mt-5 space-y-4 text-sm"><div><dt className="text-slate-500">Budget</dt><dd className="mt-1 font-semibold text-slate-900">{formatCurrency(opportunity.budget)}</dd></div><div><dt className="text-slate-500">Deadline</dt><dd className="mt-1 font-semibold text-slate-900">{formatDate(opportunity.deadline)}</dd></div><div><dt className="text-slate-500">Learner match</dt><dd className="mt-1 font-semibold text-emerald-700">{opportunity.matchScore}%</dd></div><div><dt className="text-slate-500">Last updated</dt><dd className="mt-1 font-semibold text-slate-900">{formatDate(opportunity.updatedAt)}</dd></div></dl>
        </Card>
      </div>
      <BidDesk opportunity={opportunity} />
    </div>
  );
}
