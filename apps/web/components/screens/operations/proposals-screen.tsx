"use client";

import { useEffect, useState } from "react";
import type { Proposal } from "@edurev/types";
import { proposals } from "@edurev/mock-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useQuickAction } from "@/lib/quick-actions";
import { useToast } from "@/lib/toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { IconCheckCircle, IconPlus, IconProposals } from "@/components/ui/icons";

export function ProposalsScreen() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const isStudent = user?.role === "STUDENT";
  const [proposalList, setProposalList] = useState<Proposal[]>(proposals);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [opportunityId, setOpportunityId] = useState("opp-1024");
  const [studentName, setStudentName] = useState(user?.name || "Maya Chen");
  const [value, setValue] = useState("18000");
  const [status, setStatus] = useState<"DRAFT" | "IN_REVIEW" | "APPROVED" | "SUBMITTED">("IN_REVIEW");

  const loadProposals = async () => {
    try {
      const res = await apiFetch("/proposals");
      if (res.ok) {
        const json = await res.json();
        if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
          const apiIds = new Set(json.data.map((p: Proposal) => p.id));
          const combined = [
            ...json.data,
            ...proposals.filter((p) => !apiIds.has(p.id)),
          ];
          setProposalList(combined);
          return;
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadProposals();
  }, []);

  // "+ New → Create a proposal" and the command bar open the existing create form
  useQuickAction("new-proposal", () => setIsModalOpen(true));

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !studentName) {
      toast("Please enter proposal title and student name.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/proposals", {
        method: "POST",
        body: JSON.stringify({
          title,
          studentName,
          opportunityId,
          author: user?.name || studentName,
          status,
          value: Number(value) || 0,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to create proposal.");

      setProposalList((prev) => [json.data, ...prev]);
      setNotice(`Proposal "${json.data.title}" successfully created!`);
      setIsModalOpen(false);
      setTitle("");
      setValue("18000");
    } catch (err: any) {
      toast(err.message || "Could not create proposal.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Placement Operations"
        title="Institutional Proposals"
        description="Track proposal drafts, editorial reviews, and submission status across student engagements."
        action={
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            <IconPlus size={16} />
            <span>New Proposal</span>
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

      <Card className="overflow-hidden border-[#E6E6E6] bg-white shadow-card">
        <DataTable columns={["Proposal", "Student", "Submitted", "Value", "Status"]}>
          {proposalList.map((proposal) => (
            <tr className="transition hover:bg-[#F7F7F6]/80" key={proposal.id}>
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FC] text-[#3978B8]">
                    <IconProposals size={18} />
                  </span>
                  <div>
                    <p className="font-bold text-[#30343B]">{proposal.title}</p>
                    <p className="mt-0.5 text-xs text-[#666D7A]">{proposal.opportunityId}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-4 text-xs font-semibold text-[#666D7A]">{proposal.studentName}</td>
              <td className="px-5 py-4 text-xs text-[#666D7A]">
                {proposal.submittedAt ? formatDate(proposal.submittedAt) : "Not submitted"}
              </td>
              <td className="px-5 py-4 font-bold text-[#30343B]">
                {formatCurrency(proposal.value)}
              </td>
              <td className="px-5 py-4">
                <StatusBadge status={proposal.status} />
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>

      {/* CREATE PROPOSAL MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#30343B]/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-[#E6E6E6]">
            <div className="flex items-center justify-between border-b border-[#E6E6E6] pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#3978B8]">Placement & Proposals</span>
                <h2 className="text-lg font-bold text-[#30343B] mt-0.5">Create New Proposal</h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-[#666D7A] hover:bg-[#F7F7F6] hover:text-[#30343B] transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProposal} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="propTitle">
                  Proposal Title *
                </label>
                <input
                  id="propTitle"
                  required
                  className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                  placeholder="e.g. Discovery & UX Design Proposal"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="propStudent">
                    Student Name *
                  </label>
                  <input
                    id="propStudent"
                    required
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    placeholder="e.g. Maya Chen"
                    value={isStudent ? user?.name ?? studentName : studentName}
                    disabled={isStudent}
                    title={isStudent ? "Students always submit proposals under their own name." : undefined}
                    onChange={(e) => setStudentName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="propOpp">
                    Opportunity ID
                  </label>
                  <input
                    id="propOpp"
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    placeholder="e.g. opp-1024"
                    value={opportunityId}
                    onChange={(e) => setOpportunityId(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="propValue">
                    Proposal Value (INR ₹)
                  </label>
                  <input
                    id="propValue"
                    type="number"
                    min="0"
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    placeholder="e.g. 18000"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="propStatus">
                    Workflow Status
                  </label>
                  <select
                    id="propStatus"
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="IN_REVIEW">IN_REVIEW</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="SUBMITTED">SUBMITTED</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#E6E6E6] pt-4">
                <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? "Creating…" : "Create Proposal"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
