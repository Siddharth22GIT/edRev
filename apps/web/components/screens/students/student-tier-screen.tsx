"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { can, type Student, type StudentReadinessSummary, type Tier } from "@edurev/types";
import { getStudent, getStudentTier } from "@edurev/mock-data";
import { Badge } from "@/components/ui/badge";
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
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier>("TIER_1");
  const [tierNotice, setTierNotice] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [updating, setUpdating] = useState(false);

  const isAdmin = can(user?.role, "TIER_UPDATE");

  const loadData = async () => {
    try {
      const res = await apiFetch(`/students/${id}/readiness`);
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
  const mockTierInfo = getStudentTier(id);

  return (
    <div className="space-y-7">
      <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-[#666D7A] hover:text-[#3978B8] transition" href={`/students/${id}`}>
        ← {student.name}'s Profile
      </Link>
      <PageHeader
        eyebrow="Tier Progression & Institutional Controls"
        title={`${student.name}'s Official Tier: ${currentTier}`}
        description="Official tier determines project complexity eligibility and is updated by Administrators upon reviewing readiness indicators."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 space-y-6 border-[#E6E6E6] bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-[#E6E6E6] pb-4">
            <h2 className="font-bold text-[#30343B] text-base">Readiness & Progression Summary</h2>
            <Badge tone="blue">Current: {currentTier}</Badge>
          </div>

          <div>
            <ProgressBar label="Training & Readiness Progress" tone="orange" value={trainingPct} />
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-[#30343B]">Institutional Review Criteria</h3>
            {mockTierInfo?.requirements.map((req) => (
              <div className="flex items-center gap-3 rounded-xl border border-[#E6E6E6] px-4 py-3 bg-[#F7F7F6]/50" key={req.label}>
                <span className={`grid h-5 w-5 place-items-center rounded-full text-xs font-bold ${req.completed ? "bg-emerald-100 text-emerald-700" : "bg-[#E6E6E6] text-[#666D7A]"}`}>
                  {req.completed ? "✓" : "·"}
                </span>
                <span className={req.completed ? "text-xs font-semibold text-[#30343B]" : "text-xs text-[#666D7A]"}>
                  {req.label}
                </span>
              </div>
            ))}
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
                  <option value="TIER_1">TIER_1</option>
                  <option value="TIER_2">TIER_2</option>
                  <option value="TIER_3">TIER_3</option>
                  <option value="TIER_4">TIER_4</option>
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
