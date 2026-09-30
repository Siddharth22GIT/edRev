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
        eyebrow="Learners"
        title="Students"
        description="Track learner activity, portfolio momentum, training readiness, and official tier progression."
      />
      <Card>
        <DataTable columns={["Student", "Program", "Official Tier", "Training Progress", "Earnings", "Status", ""]}>
          {students.map((student) => (
            <tr className="transition hover:bg-slate-50" key={student.id}>
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {student.avatarInitials}
                  </span>
                  <div>
                    <Link className="font-semibold text-slate-900 hover:text-blue-600" href={`/students/${student.id}`}>
                      {student.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">{student.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-4 text-slate-600">{student.program}</td>
              <td className="px-5 py-4">
                <Badge tone={student.tier === "TIER_4" ? "violet" : student.tier === "TIER_3" ? "violet" : student.tier === "TIER_2" ? "blue" : "slate"}>
                  {student.tier}
                </Badge>
              </td>
              <td className="min-w-36 px-5 py-4">
                <ProgressBar value={student.trainingProgress ?? student.progress} />
              </td>
              <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-800">
                {formatCurrency(student.earnings)}
              </td>
              <td className="px-5 py-4">
                <StatusBadge status={student.status} />
              </td>
              <td className="px-5 py-4 text-right">
                <Link className="font-semibold text-blue-600" href={`/students/${student.id}`}>
                  View Readiness →
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
      <div className="p-8 text-center text-slate-500">
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
      <Link className="inline-flex text-sm font-semibold text-slate-600 hover:text-blue-600" href="/students">
        ← All students
      </Link>
      <PageHeader
        eyebrow={student.program}
        title={student.name}
        description={`${student.email} · Joined ${formatDate(student.joinedAt)}`}
        action={
          <Link href={`/students/${student.id}/tier`}>
            <Button variant="secondary">View Tier Details →</Button>
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        {/* READINESS & SAFEGUARD OVERVIEW CARD */}
        <Card className="p-6 xl:col-span-2 space-y-6">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-100 text-lg font-bold text-blue-700">
                {student.avatarInitials}
              </span>
              <div>
                <p className="font-semibold text-slate-950">{student.name} — Student Readiness View</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={currentTier === "TIER_4" ? "violet" : currentTier === "TIER_3" ? "violet" : "blue"}>
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
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Academic Status</span>
              <p className="mt-1 text-lg font-bold text-slate-950">{acadStatus}</p>
              <p className="mt-0.5 text-xs text-slate-500">CGPA: <strong className="text-slate-900">{cgpa}</strong></p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Training Progress</span>
              <p className="mt-1 text-lg font-bold text-slate-950">{completedModules} / {totalModules} Modules</p>
              <div className="mt-1.5">
                <ProgressBar value={trainingPct} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Current Official Tier</span>
              <p className="mt-1 text-lg font-bold text-blue-700">{currentTier}</p>
              <p className="mt-0.5 text-xs text-slate-500">Set by Administrator</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Weekly Work Hours</span>
              <p className="mt-1 text-lg font-bold text-slate-950">{loggedHours} / {allowedHours} hrs</p>
              <p className="mt-0.5 text-xs text-slate-500">Institutional Cap: {allowedHours}h/week</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Exam Blackout</span>
              <p className={`mt-1 text-lg font-bold ${blackoutActive ? "text-rose-600" : "text-emerald-700"}`}>
                {blackoutActive ? "Active Blackout" : "Not Active"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {blackoutActive ? "Allocations suspended" : "Normal academic window"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Safeguard Status</span>
              <p className={`mt-1 text-lg font-bold ${safeguardEligible ? "text-emerald-700" : "text-amber-700"}`}>
                {safeguardEligible ? "All Checks Passed" : "Action Required"}
              </p>
              {!safeguardEligible && safeguardReasons.length > 0 && (
                <p className="mt-0.5 text-xs text-rose-600 line-clamp-1">{safeguardReasons[0]}</p>
              )}
            </div>
          </div>

          {/* TRAINING MODULES SECTION */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-950">Training & Skill Progression</h3>
                <p className="text-xs text-slate-500">
                  Track student readiness across active curriculum modules.
                </p>
              </div>
              <Badge tone="blue">{completedModules}/{totalModules} Completed</Badge>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900 leading-relaxed">
              <strong>Institutional Safeguard Note:</strong> Training module completion updates readiness scores, but does <strong>NOT</strong> automatically change the student's official tier. Official tier changes remain under Administrator control.
            </div>

            {modules.length > 0 ? (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {modules.map((m: TrainingModule) => (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-3" key={m.id}>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{m.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone={m.status === "COMPLETED" ? "green" : m.status === "IN_PROGRESS" ? "blue" : "slate"}>
                        {m.status}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <button
                          className="px-2 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-700 disabled:opacity-50 transition"
                          disabled={updatingModule === m.id || m.status === "COMPLETED"}
                          onClick={() => handleModuleStatusToggle(m.id, "COMPLETED")}
                        >
                          Complete
                        </button>
                        <button
                          className="px-2 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-700 disabled:opacity-50 transition"
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
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500 text-center">
                No training modules assigned.
              </div>
            )}
          </div>
        </Card>

        {/* SIDEBAR: ADMIN TIER MANAGEMENT & ACCOUNT CONTROL */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold text-slate-950">Official Tier Management</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Official student tiers determine opportunity eligibility and require administrative control.
            </p>

            {isAdmin ? (
              <form className="mt-4 space-y-4" onSubmit={handleTierUpdate}>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500" htmlFor="tierSelect">
                    Select Official Tier
                  </label>
                  <select
                    id="tierSelect"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-medium text-slate-800"
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
                  <div className={`p-3 rounded-xl text-xs font-medium ${tierNotice.isError ? "bg-rose-50 border border-rose-200 text-rose-700" : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
                    {tierNotice.msg}
                  </div>
                )}

                <Button className="w-full" disabled={updatingTier} type="submit">
                  {updatingTier ? "Saving Tier..." : "Save Official Tier Change"}
                </Button>
              </form>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 leading-relaxed">
                  <strong>Current Official Tier:</strong> <Badge tone="blue">{currentTier}</Badge>
                  <p className="mt-2 text-slate-500">
                    Official tier modifications are strictly restricted to <strong>ADMINISTRATOR</strong>.
                  </p>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-slate-950">Academic Safeguard Rules</h3>
            <ul className="mt-3 space-y-2 text-xs text-slate-600 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span>Minimum CGPA 7.0 required for opportunity allocation.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span>Max 20 hours/week hard limit (override authorized for Faculty Director & Cell Coordinator).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
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

  if (!student) return <div className="p-6 text-slate-500">Student not found.</div>;

  const currentTier = readiness?.student.tier || student.tier;
  const trainingPct = readiness?.training.progressPercentage ?? student.trainingProgress;
  const mockTierInfo = getStudentTier(id);

  return (
    <div className="space-y-7">
      <Link className="inline-flex text-sm font-semibold text-slate-600 hover:text-blue-600" href={`/students/${id}`}>
        ← {student.name}'s Profile
      </Link>
      <PageHeader
        eyebrow="Tier Progression & Institutional Controls"
        title={`${student.name}'s Official Tier: ${currentTier}`}
        description="Official tier determines project complexity eligibility and is updated by Administrators upon reviewing readiness indicators."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="font-semibold text-slate-950">Readiness & Progression Summary</h2>
            <Badge tone="blue">Current: {currentTier}</Badge>
          </div>

          <div>
            <ProgressBar label="Training & Readiness Progress" value={trainingPct} />
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-semibold text-slate-900">Institutional Review Criteria</h3>
            {mockTierInfo?.requirements.map((req) => (
              <div className="flex items-center gap-3 rounded-lg border border-slate-100 px-4 py-3" key={req.label}>
                <span className={`grid h-5 w-5 place-items-center rounded-full text-xs font-bold ${req.completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                  {req.completed ? "✓" : "·"}
                </span>
                <span className={req.completed ? "text-sm text-slate-700" : "text-sm text-slate-500"}>
                  {req.label}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="h-fit p-6 space-y-4">
          <h3 className="font-semibold text-slate-950">Admin Tier Control</h3>
          {isAdmin ? (
            <form className="space-y-4" onSubmit={handleSaveTier}>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500" htmlFor="tierSelectProg">
                  Official Tier
                </label>
                <select
                  id="tierSelectProg"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500"
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
                <div className={`p-3 rounded-xl text-xs font-medium ${tierNotice.isError ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {tierNotice.msg}
                </div>
              )}

              <Button className="w-full" disabled={updating} type="submit">
                {updating ? "Saving..." : "Update Official Tier"}
              </Button>
            </form>
          ) : (
            <p className="text-xs text-slate-500 leading-relaxed">
              Official tier changes are authorized for Administrators only. Authenticate as an Administrator to modify.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
