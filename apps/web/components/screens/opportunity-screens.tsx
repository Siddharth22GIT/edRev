"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOpportunity, opportunities as mockOpportunities } from "@edurev/mock-data";
import type { Opportunity } from "@edurev/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { BidDesk } from "@/components/opportunities/bid-desk";
import { useAuth } from "@/lib/auth-context";
import { IconBriefcase, IconPlus, IconCheckCircle, IconArrowRight, IconBuilding } from "@/components/ui/icons";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export function OpportunitiesScreen() {
  const { getAuthHeaders } = useAuth();
  const [oppList, setOppList] = useState<Opportunity[]>(mockOpportunities);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Form states
  const [project, setProject] = useState("");
  const [company, setCompany] = useState("");
  const [category, setCategory] = useState("Product Design");
  const [budget, setBudget] = useState("18000");
  const [deadline, setDeadline] = useState("2026-11-15");
  const [requiredTier, setRequiredTier] = useState<"TIER_1" | "TIER_2" | "TIER_3" | "TIER_4">("TIER_1");
  const [deliverables, setDeliverables] = useState("Research, UX Flows, Component Library");
  const [description, setDescription] = useState("");

  const loadOpportunities = async () => {
    try {
      const res = await fetch(`${API_BASE}/opportunities`);
      if (res.ok) {
        const json = await res.json();
        if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
          const apiIds = new Set(json.data.map((o: Opportunity) => o.id));
          const combined = [
            ...json.data,
            ...mockOpportunities.filter((m) => !apiIds.has(m.id)),
          ];
          setOppList(combined);
          return;
        }
      }
      setOppList(mockOpportunities);
    } catch {
      setOppList(mockOpportunities);
    }
  };

  useEffect(() => {
    loadOpportunities();
  }, []);

  const handleCreateOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !company || !budget) {
      alert("Please fill in Project title, Company, and Budget.");
      return;
    }

    setSubmitting(true);
    setNotice(null);

    const deliverablesList = deliverables
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`${API_BASE}/opportunities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          title: project,
          project,
          company,
          client: company,
          category,
          budget: Number(budget),
          deadline: deadline || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
          deliverables: deliverablesList.length > 0 ? deliverablesList : ["Research", "Design", "Delivery"],
          description: description || `Client deliverable for ${company} involving ${category}.`,
          requiredTier,
          skills: [category, "Collaboration"],
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to create opportunity.");

      const created = json.data;
      setOppList((prev) => [created, ...prev]);
      setNotice(`Opportunity "${created.project}" successfully published!`);
      setIsModalOpen(false);

      // Reset form
      setProject("");
      setCompany("");
      setCategory("Product Design");
      setBudget("18000");
      setDescription("");
    } catch (err: any) {
      alert(err.message || "Could not create opportunity.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Pipeline Management"
        title="Institutional Opportunities"
        description="Curated institutional work orders, client deliverables, and student placement pipeline."
        action={
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            <IconPlus size={16} />
            <span>Add Opportunity</span>
          </Button>
        }
      />

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <IconCheckCircle size={16} />
            {notice}
          </span>
          <button onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">✕</button>
        </div>
      )}

      {oppList.length === 0 ? (
        <EmptyState description="New opportunities will appear here once published." title="No opportunities yet" />
      ) : (
        <Card className="overflow-hidden border-[#E6E6E6] bg-white shadow-card">
          <DataTable columns={["Opportunity", "Category", "Deadline", "Budget", "Match", "Status", ""]}>
            {oppList.map((opportunity) => (
              <tr className="transition hover:bg-[#F7F7F6]/80" key={opportunity.id}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FEF6EE] text-[#C27803] ring-1 ring-[#F2A65A]/30">
                      <IconBriefcase size={18} />
                    </div>
                    <div>
                      <Link className="font-bold text-[#30343B] hover:text-[#3978B8] transition" href={`/opportunities/${opportunity.id}`}>
                        {opportunity.project}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-[#666D7A]">
                        <IconBuilding size={12} />
                        {opportunity.company}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-xs font-semibold text-[#666D7A]">{opportunity.category}</td>
                <td className="whitespace-nowrap px-5 py-4 text-xs text-[#666D7A]">{formatDate(opportunity.deadline)}</td>
                <td className="whitespace-nowrap px-5 py-4 text-sm font-bold text-[#30343B]">{formatCurrency(opportunity.budget)}</td>
                <td className="whitespace-nowrap px-5 py-4">
                  <Badge tone="orange">{opportunity.matchScore || 95}% Match</Badge>
                </td>
                <td className="px-5 py-4"><StatusBadge status={opportunity.status} /></td>
                <td className="px-5 py-4 text-right">
                  <Link
                    aria-label={`View ${opportunity.project}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#3978B8] hover:text-[#2F659C] transition"
                    href={`/opportunities/${opportunity.id}`}
                  >
                    <span>View</span>
                    <IconArrowRight size={14} />
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}

      {/* CREATE OPPORTUNITY MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#30343B]/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-[#E6E6E6]">
            <div className="flex items-center justify-between border-b border-[#E6E6E6] pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#3978B8]">Client Acquisition & Staging</span>
                <h2 className="text-lg font-bold text-[#30343B] mt-0.5">Add New Institutional Opportunity</h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-[#666D7A] hover:bg-[#F7F7F6] hover:text-[#30343B] transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOpportunity} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="projectTitle">
                    Project Title *
                  </label>
                  <input
                    id="projectTitle"
                    required
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    placeholder="e.g. Fintech Mobile Dashboard"
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="companyName">
                    Company / Client *
                  </label>
                  <input
                    id="companyName"
                    required
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    placeholder="e.g. Apex FinTech Labs"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="oppCategory">
                    Category
                  </label>
                  <select
                    id="oppCategory"
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="Product Design">Product Design</option>
                    <option value="Web Development">Web Development</option>
                    <option value="Mobile App Development">Mobile App Development</option>
                    <option value="Data & Analytics">Data & Analytics</option>
                    <option value="Content & Strategy">Content & Strategy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="oppBudget">
                    Budget (INR ₹) *
                  </label>
                  <input
                    id="oppBudget"
                    type="number"
                    min="1"
                    required
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    placeholder="e.g. 25000"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="oppDeadline">
                    Deadline
                  </label>
                  <input
                    id="oppDeadline"
                    type="date"
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="oppTier">
                    Minimum Required Tier
                  </label>
                  <select
                    id="oppTier"
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    value={requiredTier}
                    onChange={(e) => setRequiredTier(e.target.value as any)}
                  >
                    <option value="TIER_1">Tier 1 (Foundation)</option>
                    <option value="TIER_2">Tier 2 (Intermediate)</option>
                    <option value="TIER_3">Tier 3 (Advanced)</option>
                    <option value="TIER_4">Tier 4 (Expert Guild)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="oppDeliverables">
                  Expected Deliverables (comma separated)
                </label>
                <input
                  id="oppDeliverables"
                  className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                  placeholder="e.g. User Research, Wireframes, Interactive Prototype"
                  value={deliverables}
                  onChange={(e) => setDeliverables(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="oppDesc">
                  Project Scope & Description
                </label>
                <textarea
                  id="oppDesc"
                  rows={3}
                  className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                  placeholder="Describe the opportunity objectives, target outcomes, and milestones..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#E6E6E6] pt-4">
                <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? "Publishing…" : "Publish Opportunity"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function OpportunityDetailScreen({ id }: { id: string }) {
  const [opp, setOpp] = useState<Opportunity | null>(() => getOpportunity(id) || null);
  const [loading, setLoading] = useState(!opp);

  useEffect(() => {
    if (!opp) {
      fetch(`${API_BASE}/opportunities/${id}`)
        .then((res) => res.json())
        .then((json) => {
          if (json?.data) {
            setOpp(json.data);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [id, opp]);

  const scrollToBidDesk = () => {
    const el = document.getElementById("bid-desk-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (!opp && !loading) {
    return (
      <div className="space-y-5">
        <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-[#666D7A] hover:text-[#3978B8] transition" href="/opportunities">
          ← All opportunities
        </Link>
        <Card className="p-8 text-center border-[#E6E6E6] bg-white shadow-card">
          <h2 className="text-lg font-bold text-[#30343B]">Opportunity Not Found</h2>
          <p className="mt-2 text-sm text-[#666D7A]">The opportunity with ID "{id}" could not be located.</p>
        </Card>
      </div>
    );
  }

  if (!opp) return <div className="p-8 text-[#666D7A]">Loading opportunity...</div>;

  return (
    <div className="space-y-7">
      <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-[#666D7A] hover:text-[#3978B8] transition" href="/opportunities">
        ← All opportunities
      </Link>
      <PageHeader
        eyebrow={opp.company}
        title={opp.project}
        description={opp.description}
        action={
          <Button variant="primary" onClick={scrollToBidDesk}>
            <IconBriefcase size={16} />
            <span>Start proposal</span>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 border-[#E6E6E6] bg-white shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={opp.status} />
            <Badge tone="blue">{opp.category}</Badge>
          </div>
          <h2 className="mt-6 text-base font-bold text-[#30343B]">Expected Deliverables</h2>
          <ul className="mt-3.5 space-y-2.5">
            {opp.deliverables.map((deliverable) => (
              <li className="flex items-center gap-2.5 text-sm text-[#30343B]" key={deliverable}>
                <span className="text-[#3978B8] font-bold">✓</span>
                <span>{deliverable}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 border-t border-[#E6E6E6] pt-5">
            <h3 className="font-bold text-[#30343B] text-sm">Institutional Bid Desk Instructions</h3>
            <p className="mt-1.5 text-xs leading-5 text-[#666D7A]">
              Submit bids and proposal documents below. Bid Desk Analysts and Cell Coordinators review submitted proposals, inspect documents, and manage assignment safeguarding directly in the Bid Desk.
            </p>
          </div>
        </Card>

        <Card className="h-fit p-6 border-[#E6E6E6] bg-white shadow-card">
          <h2 className="font-bold text-[#30343B] text-base border-b border-[#E6E6E6] pb-3">At a Glance</h2>
          <dl className="mt-4 space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-[#666D7A]">Budget</dt>
              <dd className="font-bold text-[#30343B] text-sm">{formatCurrency(opp.budget)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#666D7A]">Deadline</dt>
              <dd className="font-semibold text-[#30343B]">{formatDate(opp.deadline)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#666D7A]">Student Match</dt>
              <dd className="font-bold text-[#C27803]">
                <Badge tone="orange">{opp.matchScore}% Match</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#666D7A]">Last Updated</dt>
              <dd className="font-semibold text-[#30343B]">{formatDate(opp.updatedAt)}</dd>
            </div>
          </dl>
        </Card>
      </div>
      <BidDesk opportunity={opp} />
    </div>
  );
}
