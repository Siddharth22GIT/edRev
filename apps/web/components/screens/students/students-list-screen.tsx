"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Student } from "@edurev/types";
import { students as mockStudents } from "@edurev/mock-data";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useApi } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { IconArrowRight } from "@/components/ui/icons";

export function StudentsScreen() {
  const [students, setStudents] = useState<Student[]>(mockStudents);
  const [loading, setLoading] = useState(true);
  const { apiFetch } = useApi();

  useEffect(() => {
    apiFetch("/students")
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
        {loading ? (
          <SkeletonRows rows={4} />
        ) : (
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
        )}
      </Card>
    </div>
  );
}
