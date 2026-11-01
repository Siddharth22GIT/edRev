"use client";

import { useState } from "react";
import Link from "next/link";
import { can } from "@edurev/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TierBadge } from "@/components/ui/tier-badge";
import { IconAlertTriangle, IconArrowRight, IconCheckCircle } from "@/components/ui/icons";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { celebrate } from "@/lib/celebrate";
import { useToast } from "@/lib/toast";
import { useWorkQueue } from "@/lib/work-queue";

/**
 * Pending tier suggestions for administrators. Approving changes the official tier; dismissing leaves it.
 * Hidden for every other role (the API enforces TIER_UPDATE as well).
 */
export function TierSuggestionsPanel({ onDecided }: { onDecided?: () => void }) {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const { tierSuggestions, refresh } = useWorkQueue();
  const [busy, setBusy] = useState<string | null>(null);

  if (!can(user?.role, "TIER_UPDATE") || tierSuggestions.length === 0) return null;

  const decide = async (id: string, action: "approve" | "dismiss") => {
    setBusy(id);
    try {
      const res = await apiFetch(`/tier-suggestions/${id}/${action}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not update the suggestion.");
      if (action === "approve") {
        toast(json.message || "Official tier updated.");
        celebrate();
      } else {
        toast("Suggestion dismissed. The tier is unchanged.", "info");
      }
      refresh();
      onDecided?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the suggestion.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="overflow-hidden border-[#FBD7B3]" id="tier-suggestions">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#FBD7B3] bg-[#FEF6EE] px-5 py-4">
        <div>
          <h2 className="font-bold text-[#30343B]">Tier suggestions</h2>
          <p className="mt-0.5 text-xs text-[#666D7A]">Generated from official CGPA, training and completed work. Only you can change an official tier.</p>
        </div>
        <Badge tone="orange">{tierSuggestions.length} to review</Badge>
      </div>
      <ul className="divide-y divide-[#E6E6E6]">
        {tierSuggestions.map((s) => (
          <li className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between" key={s.id}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link className="font-bold text-[#30343B] hover:text-[#3978B8]" href={`/students/${s.studentId}`}>
                  {s.studentName}
                </Link>
                <TierBadge tier={s.currentTier} />
                <IconArrowRight className="text-[#8C93A0]" size={14} />
                <TierBadge tier={s.suggestedTier} />
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#666D7A]">
                {s.reasons.map((reason) => (
                  <li className="flex items-center gap-1" key={reason}>
                    <IconCheckCircle className="text-emerald-600" size={12} />
                    {reason}
                  </li>
                ))}
              </ul>
              {s.notes.map((note) => (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200" key={note}>
                  <IconAlertTriangle className="mt-0.5 shrink-0" size={12} />
                  {note}
                </p>
              ))}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button disabled={busy === s.id} onClick={() => decide(s.id, "dismiss")} variant="secondary">
                Dismiss
              </Button>
              <Button disabled={busy === s.id} onClick={() => decide(s.id, "approve")} variant="primary">
                Approve {s.suggestedTier.replace("_", " ")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
