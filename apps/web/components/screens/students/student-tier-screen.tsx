"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { can, nextTierOf, TIER_INFO, TIER_ORDER, tierCriteria, type DeliveryRecord, type Student, type StudentReadinessSummary, type Tier } from "@edurev/types";
import { getStudent } from "@edurev/mock-data";
import { CriteriaList, TierLadder } from "@/components/student/tier-ladder";
import { TierBadge } from "@/components/ui/tier-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RestrictedProfileNotice } from "./restricted-profile-notice";

export function StudentTierScreen({ id }: { id: string }) {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [student, setStudent] = useState<Student | null>(() => getStudent(id) || null);
  const [readiness, setReadiness] = useState<StudentReadinessSummary | null>(null);
  const [delivery, setDelivery] = useState<DeliveryRecord | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier>("TIER_1");
  const [tierNotice, setTierNotice] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [updating, setUpdating] = useState(false);

  const isAdmin = can(user?.role, "TIER_UPDATE");

  const loadData = async () => {
    try {
      const [res, deliveryRes] = await Promise.all([apiFetch(`/students/${id}/readiness`), apiFetch(`/students/${id}/delivery-record`)]);
      if (deliveryRes.ok) setDelivery((await deliveryRes.json()).data ?? null);
      setAccessDenied(res.status === 403);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setReadiness(json.data);
          setStudent(json.data.student);
          setSelectedTier(json.data.student.tier);
        }
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleSaveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setUpdating(true);
    setTierNotice(null);

    try {
      const res = await apiFetch(`/students/${id}/tier`, {
        method: "PATCH",
        body: JSON.stringify({ tier: selectedTier }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message);

      setTierNotice({ msg: `Tier updated to ${selectedTier}.` });
      await loadData();
    } catch (err: any) {
      setTierNotice({ msg: err.message || "Tier change failed.", isError: true });
    } finally {
      setUpdating(false);
    }
  };

  if (accessDenied) return <RestrictedProfileNotice />;
  if (!student) return <div className="p-6 text-[#666D7A]">Student not found.</div>;

  const currentTier = readiness?.student.tier || student.tier;
  const trainingPct = readiness?.training.progressPercentage ?? student.trainingProgress;
  const next = nextTierOf(currentTier);
  const evaluation = {
    currentTier,
    officialCgpa: readiness?.academic ? readiness.academic.cgpa : null,
    trainingPercent: trainingPct,
    skillsCount: (readiness?.student ?? student).skills.length,
    completedDeliveries: delivery?.completed ?? 0,
    onTimeDeliveries: delivery?.onTime ?? 0,
  };

  return (
    <div className="space-y-7">
      <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-[#666D7A] hover:text-[#3978B8] transition" href={`/students/${id}`}>
        ← {student.name}'s Profile
      </Link>
      <PageHeader
        eyebrow="Tier Progression & Institutional Controls"
        title={`${student.name}'s Official Tier: ${currentTier.replace("_", " ")} · ${TIER_INFO[currentTier].name}`}
        description="Official tier determines project complexity eligibility and is updated by Administrators upon reviewing readiness indicators."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 space-y-6 border-[#E6E6E6] bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-[#E6E6E6] pb-4">
            <h2 className="font-bold text-[#30343B] text-base">Readiness & Progression Summary</h2>
            <TierBadge prefix="Current" tier={currentTier} />
          </div>

          <TierLadder current={currentTier} />

          <div>
            <ProgressBar label="Training & Readiness Progress" tone="orange" value={trainingPct} />
          </div>

          <div className="space-y-3 pt-2">
            {next ? (
              <>
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#30343B]">
                  What unlocks <TierBadge tier={next} />
                </h3>
                <CriteriaList criteria={tierCriteria(next, evaluation)} />
                <p className="text-[11px] text-[#8C93A0]">
                  {next === "TIER_4"
                    ? "TIER 4 is earned only through on-time client delivery. Meeting the criteria creates a suggestion for an administrator."
                    : "Meeting the criteria creates a suggestion; an administrator makes the final decision."}
                </p>
              </>
            ) : (
              <p className="rounded-xl bg-[#FEF6EE] p-4 text-sm font-semibold text-[#C27803]">★ Top tier reached. Keep delivering on time to stay here.</p>
            )}
            {delivery && (
              <div className="grid grid-cols-3 gap-3 pt-2 text-center">
                <div className="rounded-xl bg-[#F7F7F6] p-3">
                  <p className="text-lg font-extrabold text-[#30343B]">{delivery.completed}</p>
                  <p className="text-[11px] font-semibold text-[#666D7A]">Delivered</p>
                </div>
                <div className="rounded-xl bg-[#F7F7F6] p-3">
                  <p className="text-lg font-extrabold text-[#30343B]">{delivery.completed ? `${delivery.onTimeRate}%` : "–"}</p>
                  <p className="text-[11px] font-semibold text-[#666D7A]">On time</p>
                </div>
                <div className="rounded-xl bg-[#F7F7F6] p-3">
                  <p className="text-lg font-extrabold text-[#30343B]">{delivery.active}</p>
                  <p className="text-[11px] font-semibold text-[#666D7A]">In progress</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="h-fit p-6 space-y-4 border-[#E6E6E6] bg-white shadow-card">
          <h3 className="font-bold text-[#30343B] text-base border-b border-[#E6E6E6] pb-3">Admin Tier Control</h3>
          {isAdmin ? (
            <form className="space-y-4" onSubmit={handleSaveTier}>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="tierSelectProg">
                  Official Tier
                </label>
                <select
                  id="tierSelectProg"
                  className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2] font-semibold text-[#30343B]"
                  onChange={(e) => setSelectedTier(e.target.value as Tier)}
                  value={selectedTier}
                >
                  {TIER_ORDER.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier.replace("_", " ")} · {TIER_INFO[tier].name}
                    </option>
                  ))}
                </select>
              </div>

              {tierNotice && (
                <div className={`p-3 rounded-xl text-xs font-bold ${tierNotice.isError ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                  {tierNotice.msg}
                </div>
              )}

              <Button variant="primary" className="w-full" disabled={updating} type="submit">
                {updating ? "Saving..." : "Update Official Tier"}
              </Button>
            </form>
          ) : (
            <p className="text-xs text-[#666D7A] leading-relaxed">
              Official tier changes are authorized for Administrators only. Authenticate as an Administrator to modify.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
