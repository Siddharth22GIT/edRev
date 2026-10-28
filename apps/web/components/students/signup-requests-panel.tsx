"use client";

import { useState } from "react";
import { can } from "@edurev/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { celebrate } from "@/lib/celebrate";
import { formatDate } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { useWorkQueue } from "@/lib/work-queue";

/**
 * Pending student sign-ups for Cell Coordinators and Administrators. Approving creates the student
 * (TIER 1); rejecting needs a reason the student will see. The API enforces SIGNUP_REVIEW as well.
 */
export function SignupRequestsPanel({ onDecided }: { onDecided?: () => void }) {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const { signupRequests, refresh } = useWorkQueue();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (!can(user?.role, "SIGNUP_REVIEW") || signupRequests.length === 0) return null;

  const act = async (userId: string, action: "approve" | "reject") => {
    setBusy(userId);
    try {
      const res = await apiFetch(`/signup-requests/${userId}/${action}`, {
        method: "POST",
        body: action === "reject" ? JSON.stringify({ reason: reason.trim() }) : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not update the request.");
      if (action === "approve") {
        toast(json.message || "Account approved.");
        celebrate();
      } else {
        toast("Request rejected. The student will see your reason.", "info");
      }
      setRejecting(null);
      setReason("");
      refresh();
      onDecided?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the request.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="overflow-hidden border-[#C2DCF2]" id="signup-requests">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C2DCF2] bg-[#EFF6FC] px-5 py-4">
        <div>
          <h2 className="font-bold text-[#30343B]">Sign-up requests</h2>
          <p className="mt-0.5 text-xs text-[#666D7A]">Students who registered with their @lpu.in email. Approved students start at TIER 1.</p>
        </div>
        <Badge tone="blue">{signupRequests.length} waiting</Badge>
      </div>
      <ul className="divide-y divide-[#E6E6E6]">
        {signupRequests.map((r) => (
          <li className="p-5" key={r.userId}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-[#30343B]">{r.name}</p>
                  <span className="text-xs text-[#666D7A]">{r.email}</span>
                  {r.attempts > 1 && <Badge tone="amber">Re-applied ({r.attempts}/3)</Badge>}
                </div>
                <p className="mt-1 text-xs text-[#666D7A]">
                  Reg. no. <strong className="text-[#30343B]">{r.registrationNumber}</strong> · {r.program} · {r.course} · Year {r.year} · requested {formatDate(r.requestedAt)}
                </p>
              </div>
              {rejecting !== r.userId && (
                <div className="flex shrink-0 gap-2">
                  <Button disabled={busy === r.userId} onClick={() => setRejecting(r.userId)} variant="secondary">
                    Reject
                  </Button>
                  <Button disabled={busy === r.userId} onClick={() => act(r.userId, "approve")} variant="primary">
                    Approve
                  </Button>
                </div>
              )}
            </div>
            {rejecting === r.userId && (
              <form
                className="rise-in mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(r.userId, "reject");
                }}
              >
                <input
                  aria-label="Reason for rejecting"
                  autoFocus
                  className="flex-1 rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-4 py-2 text-sm outline-none focus:border-[#3978B8] focus:bg-white focus:ring-2 focus:ring-[#C2DCF2]"
                  maxLength={300}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason the student will see, e.g. registration number not found"
                  value={reason}
                />
                <Button onClick={() => setRejecting(null)} variant="ghost">
                  Cancel
                </Button>
                <Button disabled={busy === r.userId || reason.trim().length < 3} type="submit" variant="destructive">
                  Reject request
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
