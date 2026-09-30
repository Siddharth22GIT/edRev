"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Allocation, Bid, Opportunity } from "@edurev/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/format";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export function BidDesk({ opportunity }: { opportunity: Opportunity }) {
  const { user, getAuthHeaders } = useAuth();
  const [bids, setBids] = useState<Bid[]>([]);
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [amount, setAmount] = useState(String(opportunity.budget));
  const [days, setDays] = useState("7 days");
  const [skills, setSkills] = useState("");
  const [notice, setNotice] = useState("");

  const role = user?.role || "STUDENT";
  const studentId = user?.studentId || user?.id || "stu-202";
  const mine = bids.some((b) => b.studentId === studentId);

  const loadData = async () => {
    try {
      const [bidsRes, allocRes] = await Promise.all([
        fetch(`${api}/opportunities/${opportunity.id}/bids`),
        fetch(`${api}/opportunities/${opportunity.id}/allocation`),
      ]);

      const bidsJson = await bidsRes.json();
      setBids(bidsJson.data ?? []);

      if (allocRes.ok) {
        const allocJson = await allocRes.json();
        setAllocation(allocJson.data ?? null);
      }
    } catch {
      setNotice("API is currently offline. Viewing in offline mode.");
    }
  };

  useEffect(() => {
    loadData();
  }, [opportunity.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setState("error");
      setNotice("Please sign in as a Student to submit a bid.");
      return;
    }
    if (!amount || !days || !message || !skills) {
      setState("error");
      setNotice("Complete every bid field before submitting.");
      return;
    }
    setState("loading");
    try {
      const r = await fetch(`${api}/opportunities/${opportunity.id}/bids`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          proposedAmount: Number(amount),
          estimatedCompletionTime: days,
          message,
          relevantSkills: skills,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      setBids((x) => [...x, j.data]);
      setState("success");
      setNotice("Bid submitted successfully.");
    } catch (e) {
      setState("error");
      setNotice(e instanceof Error ? e.message : "Unable to submit bid.");
    }
  };

  const allocate = async (bidderStudentId: string) => {
    if (!user) {
      setState("error");
      setNotice("Please sign in as a Bid Desk Analyst to allocate work.");
      return;
    }
    setState("loading");
    try {
      const r = await fetch(`${api}/opportunities/${opportunity.id}/allocate`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          studentId: bidderStudentId,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);

      setState("success");
      setNotice(`Opportunity successfully allocated to Student ${bidderStudentId}.`);
      await loadData();
    } catch (e) {
      setState("error");
      setNotice(e instanceof Error ? e.message : "Allocation blocked.");
    }
  };

  return (
    <div className="space-y-6">
      {/* SLA Persistent Tracking Display Card if Allocated */}
      {allocation && (
        <Card className="border-blue-200 bg-blue-50/40 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-blue-100 pb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Active SLA Commitment</span>
              <h3 className="mt-1 text-lg font-bold text-slate-950">Work Allocation & SLA Tracking</h3>
            </div>
            <Badge tone={allocation.slaStatus === "OVERDUE" ? "red" : allocation.slaStatus === "AT_RISK" ? "amber" : "green"}>

              SLA Status: {allocation.slaStatus || "ACTIVE"}
            </Badge>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <span className="block text-slate-500 text-xs font-medium">Assigned Student</span>
              <span className="font-semibold text-slate-900">{allocation.studentId}</span>
            </div>
            <div>
              <span className="block text-slate-500 text-xs font-medium">Allocated By</span>
              <span className="font-semibold text-slate-900">{allocation.allocatedBy}</span>
            </div>
            <div>
              <span className="block text-slate-500 text-xs font-medium">Allocated At</span>
              <span className="font-semibold text-slate-900">{formatDate(allocation.allocatedAt)}</span>
            </div>
            <div>
              <span className="block text-slate-500 text-xs font-medium">SLA Target Deadline</span>
              <span className="font-semibold text-blue-700">{allocation.slaDeadline ? formatDate(allocation.slaDeadline) : "72 hours"}</span>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Opportunity Bid Desk</h2>
            <p className="mt-1 text-xs text-slate-500">
              {user ? (
                <span>Authenticated Session: <strong className="text-slate-900">{user.name}</strong> ({user.role})</span>
              ) : (
                <span>Public View Mode. <Link className="font-semibold text-blue-600 hover:underline" href="/login">Sign in</Link> to bid or allocate.</span>
              )}
            </p>
          </div>
          {user && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
              Role: {user.role}
            </span>
          )}
        </div>

        {notice && (
          <p className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${state === "error" ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {notice}
          </p>
        )}

        {/* STUDENT BID FORM */}
        {role === "STUDENT" ? (
          <form className="mt-6 grid gap-4" onSubmit={submit}>
            {mine ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
                ✓ You have already submitted a bid for this opportunity.
              </div>
            ) : opportunity.status === "ALLOCATED" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm font-medium text-slate-600">
                This opportunity has already been allocated to a student.
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500" htmlFor="proposedAmount">
                      Proposed Amount ({opportunity.currency})
                    </label>
                    <input
                      id="proposedAmount"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      min="1"
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="e.g. 18000"
                      type="number"
                      value={amount}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500" htmlFor="estimatedCompletionTime">
                      Estimated Delivery Time
                    </label>
                    <input
                      id="estimatedCompletionTime"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      onChange={(e) => setDays(e.target.value)}
                      placeholder="e.g. 7 days"
                      value={days}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500" htmlFor="relevantSkills">
                    Relevant Skills & Tools
                  </label>
                  <input
                    id="relevantSkills"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    onChange={(e) => setSkills(e.target.value)}
                    placeholder="e.g. Figma, User Interviews, React"
                    value={skills}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500" htmlFor="bidMessage">
                    Cover Message / Delivery Proposal
                  </label>
                  <textarea
                    id="bidMessage"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Explain why you are a great fit for this client project..."
                    rows={3}
                    value={message}
                  />
                </div>

                <Button className="mt-2" disabled={state === "loading"} type="submit">
                  {state === "loading" ? "Submitting Bid…" : "Submit Bid to Opportunity"}
                </Button>
              </>
            )}
          </form>
        ) : (
          /* ANALYST / ADMIN BID REVIEW & ALLOCATION BOARD */
          <div className="mt-6 space-y-4">
            <h3 className="font-semibold text-slate-950">Submitted Learner Bids ({bids.length})</h3>
            {bids.length ? (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {bids.map((b) => (
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" key={b.id}>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{b.studentId}</span>
                        <Badge tone={b.status === "ALLOCATED" ? "green" : "blue"}>{b.status}</Badge>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-700">Proposed: ₹{b.proposedAmount} · Delivery: {b.estimatedCompletionTime}</p>
                      <p className="mt-1 text-xs text-slate-500">Skills: {b.relevantSkills}</p>
                      <p className="mt-1 text-xs italic text-slate-600">"{b.message}"</p>
                    </div>

                    {(role === "BID_DESK_ANALYST" || role === "CELL_COORDINATOR" || role === "ADMINISTRATOR") && opportunity.status !== "ALLOCATED" && (
                      <Button
                        className="shrink-0"
                        disabled={state === "loading" || b.status === "ALLOCATED"}
                        onClick={() => allocate(b.studentId)}
                      >
                        {state === "loading" ? "Processing…" : "Allocate Work"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-slate-100 bg-slate-50/50 p-6 text-center text-sm text-slate-500">
                No bids have been submitted for this opportunity yet.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
