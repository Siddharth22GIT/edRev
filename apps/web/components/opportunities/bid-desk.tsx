"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Bid, Opportunity } from "@edurev/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export function BidDesk({ opportunity }: { opportunity: Opportunity }) {
  const { user, getAuthHeaders } = useAuth();
  const [bids, setBids] = useState<Bid[]>([]);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [amount, setAmount] = useState(String(opportunity.budget));
  const [days, setDays] = useState("7 days");
  const [skills, setSkills] = useState("");
  const [notice, setNotice] = useState("");

  const role = user?.role || "STUDENT";
  const studentId = user?.studentId || "stu-202";
  const mine = bids.some((b) => b.studentId === studentId);

  const load = async () => {
    try {
      const r = await fetch(`${api}/opportunities/${opportunity.id}/bids`);
      const j = await r.json();
      setBids(j.data ?? []);
    } catch {
      setNotice("Bids are unavailable until the API is running.");
    }
  };

  useEffect(() => {
    load();
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
      setNotice("Complete every bid field.");
      return;
    }
    setState("loading");
    try {
      const r = await fetch(`${api}/opportunities/${opportunity.id}/bids`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          studentId,
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
          allocatedBy: user.name || role,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      setState("success");
      setNotice(`Opportunity allocated to ${bidderStudentId}.`);
    } catch (e) {
      setState("error");
      setNotice(e instanceof Error ? e.message : "Allocation blocked.");
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">Opportunity Bid Desk</h2>
          <p className="text-sm text-slate-500">
            {user ? (
              <span>Authenticated session: <strong className="text-slate-900">{user.name}</strong> ({user.role})</span>
            ) : (
              <span>Public view mode. <Link className="font-semibold text-blue-600 hover:underline" href="/login">Sign in</Link> to interact.</span>
            )}
          </p>
        </div>
        {user && (
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
            Role: {user.role}
          </span>
        )}
      </div>

      {notice && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${state === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
          {notice}
        </p>
      )}

      {role === "STUDENT" ? (
        <form className="mt-5 grid gap-3" onSubmit={submit}>
          {mine ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 font-medium">
              You have already submitted a bid for this opportunity.
            </p>
          ) : (
            <>
              <input
                className="rounded-lg border p-2 text-sm outline-none focus:border-blue-500"
                min="1"
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Proposed amount"
                type="number"
                value={amount}
              />
              <input
                className="rounded-lg border p-2 text-sm outline-none focus:border-blue-500"
                onChange={(e) => setDays(e.target.value)}
                placeholder="Estimated completion time"
                value={days}
              />
              <input
                className="rounded-lg border p-2 text-sm outline-none focus:border-blue-500"
                onChange={(e) => setSkills(e.target.value)}
                placeholder="Relevant skills / experience"
                value={skills}
              />
              <textarea
                className="rounded-lg border p-2 text-sm outline-none focus:border-blue-500"
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Student message"
                value={message}
              />
              <Button disabled={state === "loading"} type="submit">
                {state === "loading" ? "Submitting…" : "Submit bid"}
              </Button>
            </>
          )}
        </form>
      ) : (
        <div className="mt-5 space-y-3">
          {bids.length ? (
            bids.map((b) => (
              <div className="rounded-lg border p-3 text-sm" key={b.id}>
                <b>Student: {b.studentId}</b> · ₹{b.proposedAmount}
                <p className="mt-1 text-slate-600">{b.relevantSkills}</p>
                <p className="mt-1 text-xs text-slate-500">"{b.message}"</p>
                {(role === "BID_DESK_ANALYST" || role === "ADMINISTRATOR") && (
                  <Button className="mt-3" disabled={state === "loading"} onClick={() => allocate(b.studentId)}>
                    Allocate after eligibility check
                  </Button>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No bids submitted yet.</p>
          )}
        </div>
      )}
    </Card>
  );
}
