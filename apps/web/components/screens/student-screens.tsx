"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Student, StudentReadinessSummary, Tier, TrainingModule } from "@edurev/types";
import { getStudent, getStudentTier, students as mockStudents } from "@edurev/mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  IconGraduationCap,
  IconUserCheck,
  IconCheckCircle,
  IconAlertTriangle,
  IconArrowRight,
  IconShield,
  IconClock,
} from "@/components/ui/icons";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export function StudentsScreen() {
  const [students, setStudents] = useState<Student[]>(mockStudents);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/students`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          setStudents(data.data);
        }
      })
      .catch(() => {
        // Fallback to mock data if API offline
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Cohort Management"
        title="Institutional Students"
        description="Track student activity, readiness progression, training milestones, and official tier certifications."
      />
      <Card className="overflow-hidden border-[#E6E6E6] bg-white shadow-card">
        <DataTable columns={["Student", "Program", "Official Tier", "Training Progress", "Earnings", "Status", ""]}>
          {students.map((student) => (
            <tr className="transition hover:bg-[#F7F7F6]/80" key={student.id}>
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#FEF6EE] text-xs font-bold text-[#C27803] ring-1 ring-[#F2A65A]/30">
                    {student.avatarInitials}
                  </span>
                  <div>
                    <Link className="font-bold text-[#30343B] hover:text-[#3978B8] transition" href={`/students/${student.id}`}>
                      {student.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-[#666D7A]">{student.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-4 text-xs font-semibold text-[#666D7A]">{student.program}</td>
              <td className="px-5 py-4">
                <Badge tone={student.tier === "TIER_4" ? "orange" : student.tier === "TIER_3" ? "orange" : student.tier === "TIER_2" ? "blue" : "slate"}>
                  {student.tier}
                </Badge>
              </td>
              <td className="min-w-36 px-5 py-4">
                <ProgressBar tone="orange" value={student.trainingProgress ?? student.progress} />
              </td>
              <td className="whitespace-nowrap px-5 py-4 font-bold text-[#30343B]">
                {formatCurrency(student.earnings)}
              </td>
              <td className="px-5 py-4">
                <StatusBadge status={student.status} />
              </td>
              <td className="px-5 py-4 text-right">
                <Link
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#3978B8] hover:text-[#2F659C] transition"
                  href={`/students/${student.id}`}
                >
                  <span>Readiness</span>
                  <IconArrowRight size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </div>
  );
}

export function StudentDetailScreen({ id }: { id: string }) {
  const { user, getAuthHeaders } = useAuth();
  const [readiness, setReadiness] = useState<StudentReadinessSummary | null>(null);
  const [student, setStudent] = useState<Student | null>(() => getStudent(id) || null);
  const [selectedTier, setSelectedTier] = useState<Tier>("TIER_1");
  const [tierNotice, setTierNotice] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [updatingTier, setUpdatingTier] = useState(false);
  const [updatingModule, setUpdatingModule] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMINISTRATOR";

  const loadReadinessData = async () => {
    try {
      const res = await fetch(`${API_BASE}/students/${id}/readiness`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setReadiness(json.data);
          setStudent(json.data.student);
          setSelectedTier(json.data.student.tier);
        }
      }
    } catch {
      // Keep initial/fallback state
    }
  };

  useEffect(() => {
    loadReadinessData();
  }, [id]);

  const handleTierUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setTierNotice({ msg: "Only Administrators are authorized to modify official student tiers.", isError: true });
      return;
    }

    setUpdatingTier(true);
    setTierNotice(null);

    try {
      const res = await fetch(`${API_BASE}/students/${id}/tier`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ tier: selectedTier }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to update official tier.");
      }

      setTierNotice({ msg: `Official tier updated to ${selectedTier} successfully.` });
      await loadReadinessData();
    } catch (err: any) {
      setTierNotice({ msg: err.message || "Tier update failed.", isError: true });
    } finally {
      setUpdatingTier(false);
    }
  };

  const handleModuleStatusToggle = async (moduleId: string, newStatus: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED") => {
    setUpdatingModule(moduleId);
    try {
      const res = await fetch(`${API_BASE}/students/${id}/training/${moduleId}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        await loadReadinessData();
      }
    } catch {
      // Ignore transient UI update failure
    } finally {
      setUpdatingModule(null);
    }
  };

  if (!student) {
    return (
      <div className="p-8 text-center text-[#666D7A]">
        Student profile not found.
      </div>
    );
  }

  const currentTier = readiness?.student.tier || student.tier;
  const modules = readiness?.training.modules || [];
  const completedModules = readiness?.training.completedCount ?? 0;
  const totalModules = readiness?.training.totalCount ?? modules.length;
  const trainingPct = readiness?.training.progressPercentage ?? student.trainingProgress;
  const cgpa = readiness?.academic?.cgpa ?? student.cgpa;
  const acadStatus = readiness?.academic?.cgpaStatus ?? "ELIGIBLE";
  const loggedHours = readiness?.hours?.loggedHours ?? 12;
  const allowedHours = readiness?.hours?.allowedHours ?? 20;
  const blackoutActive = readiness?.blackoutActive ?? false;
  const safeguardEligible = readiness?.safeguardCheck.eligible ?? true;
  const safeguardReasons = readiness?.safeguardCheck.reasons ?? [];

  return (
    <div className="space-y-7">
      <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-[#666D7A] hover:text-[#3978B8] transition" href="/students">
        ← All students
      </Link>
      <PageHeader
        eyebrow={student.program}
        title={student.name}
        description={`${student.email} · Joined ${formatDate(student.joinedAt)}`}
        action={
          <Link href={`/students/${student.id}/tier`}>
            <Button variant="secondary">
              <span>View Tier Details</span>
              <IconArrowRight size={14} />
            </Button>
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        {/* READINESS & SAFEGUARD OVERVIEW CARD */}
        <Card className="p-6 xl:col-span-2 space-y-6 border-[#E6E6E6] bg-white shadow-card">
          <div className="flex flex-col gap-4 border-b border-[#E6E6E6] pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#FEF6EE] text-lg font-bold text-[#C27803] ring-2 ring-[#F2A65A]/40">
                {student.avatarInitials}
              </span>
              <div>
                <p className="font-bold text-[#30343B] text-base">{student.name} — Student Readiness View</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={currentTier === "TIER_4" ? "orange" : currentTier === "TIER_3" ? "orange" : "blue"}>
                    Official Tier: {currentTier}
                  </Badge>
                  <StatusBadge status={student.status} />
                  <Badge tone={safeguardEligible ? "green" : "red"}>
                    {safeguardEligible ? "Opportunity Eligible" : "Safeguard Blocked"}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* REAL TIME READINESS GRID */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/60 p-4">
              <span className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]">Academic Status</span>
              <p className="mt-1 text-lg font-bold text-[#30343B]">{acadStatus}</p>
              <p className="mt-0.5 text-xs text-[#666D7A]">CGPA: <strong className="text-[#30343B]">{cgpa}</strong></p>
            </div>

            <div className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/60 p-4">
              <span className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]">Training Progress</span>
              <p className="mt-1 text-lg font-bold text-[#30343B]">{completedModules} / {totalModules} Modules</p>
              <div className="mt-2">
                <ProgressBar tone="orange" value={trainingPct} />
              </div>
            </div>

            <div className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/60 p-4">
              <span className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]">Current Official Tier</span>
              <p className="mt-1 text-lg font-bold text-[#3978B8]">{currentTier}</p>
              <p className="mt-0.5 text-xs text-[#666D7A]">Set by Administrator</p>
            </div>

            <div className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/60 p-4">
              <span className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]">Weekly Work Hours</span>
              <p className="mt-1 text-lg font-bold text-[#30343B]">{loggedHours} / {allowedHours} hrs</p>
              <p className="mt-0.5 text-xs text-[#666D7A]">Institutional Cap: {allowedHours}h/week</p>
            </div>

            <div className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/60 p-4">
              <span className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]">Exam Blackout</span>
              <p className={`mt-1 text-lg font-bold ${blackoutActive ? "text-rose-600" : "text-emerald-700"}`}>
                {blackoutActive ? "Active Blackout" : "Not Active"}
              </p>
              <p className="mt-0.5 text-xs text-[#666D7A]">
                {blackoutActive ? "Allocations suspended" : "Normal academic window"}
              </p>
            </div>

            <div className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/60 p-4">
              <span className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]">Safeguard Status</span>
              <p className={`mt-1 text-lg font-bold ${safeguardEligible ? "text-emerald-700" : "text-amber-700"}`}>
                {safeguardEligible ? "All Checks Passed" : "Action Required"}
              </p>
              {!safeguardEligible && safeguardReasons.length > 0 && (
                <p className="mt-0.5 text-xs text-rose-600 line-clamp-1">{safeguardReasons[0]}</p>
              )}
            </div>
          </div>

          {/* TRAINING MODULES SECTION */}
          <div className="pt-4 border-t border-[#E6E6E6] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[#30343B] text-base">Training & Skill Progression</h3>
                <p className="text-xs text-[#666D7A]">
                  Track student readiness across active curriculum modules.
                </p>
              </div>
              <Badge tone="blue">{completedModules}/{totalModules} Completed</Badge>
            </div>

            <div className="rounded-xl border border-[#E6E6E6] bg-[#FEF6EE] p-3.5 text-xs text-[#C27803] leading-relaxed">
              <strong>Institutional Safeguard Note:</strong> Training module completion updates readiness scores, but does <strong>NOT</strong> automatically change the student's official tier. Official tier changes remain under Administrator control.
            </div>

            {modules.length > 0 ? (
              <div className="divide-y divide-[#E6E6E6] rounded-xl border border-[#E6E6E6] bg-white">
                {modules.map((m: TrainingModule) => (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-3 transition hover:bg-[#F7F7F6]/50" key={m.id}>
                    <div>
                      <p className="font-bold text-[#30343B] text-sm">{m.title}</p>
                      <p className="text-xs text-[#666D7A] mt-0.5">{m.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone={m.status === "COMPLETED" ? "green" : m.status === "IN_PROGRESS" ? "blue" : "slate"}>
                        {m.status}
                      </Badge>
                      <div className="flex items-center gap-1.5">
                        <button
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-[#F7F7F6] hover:bg-emerald-100 hover:text-emerald-700 text-[#30343B] disabled:opacity-50 transition border border-[#E6E6E6]"
                          disabled={updatingModule === m.id || m.status === "COMPLETED"}
                          onClick={() => handleModuleStatusToggle(m.id, "COMPLETED")}
                        >
                          Complete
                        </button>
                        <button
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-[#F7F7F6] hover:bg-[#EFF6FC] hover:text-[#3978B8] text-[#30343B] disabled:opacity-50 transition border border-[#E6E6E6]"
                          disabled={updatingModule === m.id || m.status === "IN_PROGRESS"}
                          onClick={() => handleModuleStatusToggle(m.id, "IN_PROGRESS")}
                        >
                          In Progress
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] p-4 text-xs text-[#666D7A] text-center">
                No training modules assigned.
              </div>
            )}
          </div>
        </Card>

        {/* SIDEBAR: ADMIN TIER MANAGEMENT & ACCOUNT CONTROL */}
        <div className="space-y-6">
          <Card className="p-6 border-[#E6E6E6] bg-white shadow-card">
            <h3 className="font-bold text-[#30343B] text-base">Official Tier Management</h3>
            <p className="mt-1 text-xs text-[#666D7A] leading-relaxed">
              Official student tiers determine opportunity eligibility and require administrative control.
            </p>

            {isAdmin ? (
              <form className="mt-4 space-y-4" onSubmit={handleTierUpdate}>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="tierSelect">
                    Select Official Tier
                  </label>
                  <select
                    id="tierSelect"
                    className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2] font-semibold text-[#30343B]"
                    onChange={(e) => setSelectedTier(e.target.value as Tier)}
                    value={selectedTier}
                  >
                    <option value="TIER_1">TIER_1 (Foundational)</option>
                    <option value="TIER_2">TIER_2 (Intermediate)</option>
                    <option value="TIER_3">TIER_3 (Advanced)</option>
                    <option value="TIER_4">TIER_4 (Lead / Master)</option>
                  </select>
                </div>

                {tierNotice && (
                  <div className={`p-3 rounded-xl text-xs font-bold ${tierNotice.isError ? "bg-rose-50 border border-rose-200 text-rose-700" : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
                    {tierNotice.msg}
                  </div>
                )}

                <Button variant="primary" className="w-full" disabled={updatingTier} type="submit">
                  {updatingTier ? "Saving Tier..." : "Save Official Tier Change"}
                </Button>
              </form>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] p-4 text-xs text-[#666D7A] leading-relaxed">
                  <strong>Current Official Tier:</strong> <Badge tone="blue">{currentTier}</Badge>
                  <p className="mt-2 text-[#666D7A]">
                    Official tier modifications are strictly restricted to <strong>ADMINISTRATOR</strong>.
                  </p>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6 border-[#E6E6E6] bg-white shadow-card">
            <div className="flex items-center gap-2 border-b border-[#E6E6E6] pb-3">
              <span className="text-[#3978B8]">
                <IconShield size={18} />
              </span>
              <h3 className="font-bold text-[#30343B] text-base">Academic Safeguard Rules</h3>
            </div>
            <ul className="mt-3.5 space-y-2.5 text-xs text-[#666D7A] leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-[#3978B8] font-bold">•</span>
                <span>Minimum CGPA 7.0 required for opportunity allocation.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#3978B8] font-bold">•</span>
                <span>Max 20 hours/week hard limit (override authorized for Faculty Director & Cell Coordinator).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#3978B8] font-bold">•</span>
                <span>Exam blackout periods automatically block allocations.</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function StudentTierScreen({ id }: { id: string }) {
  const { user, getAuthHeaders } = useAuth();
  const [student, setStudent] = useState<Student | null>(() => getStudent(id) || null);
  const [readiness, setReadiness] = useState<StudentReadinessSummary | null>(null);
  const [selectedTier, setSelectedTier] = useState<Tier>("TIER_1");
  const [tierNotice, setTierNotice] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [updating, setUpdating] = useState(false);

  const isAdmin = user?.role === "ADMINISTRATOR";

  const loadData = async () => {
    try {
      const res = await fetch(`${API_BASE}/students/${id}/readiness`);
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
      const res = await fetch(`${API_BASE}/students/${id}/tier`, {
        method: "PATCH",
        headers: getAuthHeaders(),
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
