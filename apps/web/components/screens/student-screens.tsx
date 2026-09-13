import Link from "next/link";
import { getStudent, getStudentTier, students } from "@edurev/mock-data";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, formatDate } from "@/lib/format";

export function StudentsScreen() {
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Learners" title="Students" description="Track learner activity, portfolio momentum, and readiness for opportunity matching." action={<Button>+ Add student</Button>} />
      <Card>
        <DataTable columns={["Student", "Program", "Tier", "Progress", "Earnings", "Status", ""]}>
          {students.map((student) => (
            <tr className="transition hover:bg-slate-50" key={student.id}>
              <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{student.avatarInitials}</span><div><Link className="font-semibold text-slate-900 hover:text-blue-600" href={`/students/${student.id}`}>{student.name}</Link><p className="mt-1 text-xs text-slate-500">{student.email}</p></div></div></td>
              <td className="px-5 py-4 text-slate-600">{student.program}</td>
              <td className="px-5 py-4"><Badge tone={student.tier === "TIER_4" ? "violet" : student.tier === "TIER_2" ? "blue" : "slate"}>{student.tier}</Badge></td>
              <td className="min-w-36 px-5 py-4"><ProgressBar value={student.progress} /></td>
              <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-800">{formatCurrency(student.earnings)}</td>
              <td className="px-5 py-4"><StatusBadge status={student.status} /></td>
              <td className="px-5 py-4 text-right"><Link className="font-semibold text-blue-600" href={`/students/${student.id}`}>View →</Link></td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </div>
  );
}

export function StudentDetailScreen({ id }: { id: string }) {
  const student = getStudent(id);
  if (!student) notFound();

  return (
    <div className="space-y-7">
      <Link className="inline-flex text-sm font-semibold text-slate-600 hover:text-blue-600" href="/students">← All students</Link>
      <PageHeader eyebrow={student.program} title={student.name} description={`${student.email} · Joined ${formatDate(student.joinedAt)}`} action={<Button>Message student</Button>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-6 xl:col-span-2">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-100 text-lg font-bold text-blue-700">{student.avatarInitials}</span><div><p className="font-semibold text-slate-950">Learner profile</p><div className="mt-2 flex gap-2"><Badge tone={student.tier === "TIER_4" ? "violet" : "blue"}>{student.tier}</Badge><StatusBadge status={student.status} /></div></div></div><Link className="text-sm font-semibold text-blue-600" href={`/students/${student.id}/tier`}>View tier progress →</Link></div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2"><div><p className="text-sm text-slate-500">Program progress</p><div className="mt-3"><ProgressBar label="Curriculum and portfolio" value={student.progress} /></div></div><dl className="grid grid-cols-2 gap-5 text-sm"><div><dt className="text-slate-500">Projects</dt><dd className="mt-1 text-xl font-bold text-slate-950">{student.projectsCompleted}</dd></div><div><dt className="text-slate-500">Earnings</dt><dd className="mt-1 text-xl font-bold text-slate-950">{formatCurrency(student.earnings)}</dd></div><div><dt className="text-slate-500">Mentor</dt><dd className="mt-1 font-semibold text-slate-900">{student.mentor}</dd></div><div><dt className="text-slate-500">Status</dt><dd className="mt-1"><StatusBadge status={student.status} /></dd></div></dl></div>
        </Card>
        <Card className="h-fit p-6"><h2 className="font-semibold text-slate-950">Week 5 scope</h2><p className="mt-2 text-sm leading-6 text-slate-600">The profile establishes the information architecture. Progress updates, mentor notes, and actions are scheduled for later milestones.</p><Button className="mt-5 w-full" variant="secondary">Add internal note</Button></Card>
      </div>
    </div>
  );
}

export function StudentTierScreen({ id }: { id: string }) {
  const student = getStudent(id);
  const tier = getStudentTier(id);
  if (!student || !tier) notFound();

  return (
    <div className="space-y-7">
      <Link className="inline-flex text-sm font-semibold text-slate-600 hover:text-blue-600" href={`/students/${id}`}>← {student.name}</Link>
      <PageHeader eyebrow="Tier progression" title={`${student.name}'s ${tier.currentTier} tier`} description={tier.nextTier ? `Complete the remaining requirements to progress to ${tier.nextTier}.` : "This learner has reached the highest current tier."} />
      <div className="grid gap-6 lg:grid-cols-3"><Card className="p-6 lg:col-span-2"><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-950">Progress to {tier.nextTier ?? "mastery"}</h2><Badge tone="blue">{tier.currentTier}</Badge></div><div className="mt-6"><ProgressBar label="Tier readiness" value={tier.progressToNextTier} /></div><div className="mt-8 space-y-3">{tier.requirements.map((requirement) => <div className="flex items-center gap-3 rounded-lg border border-slate-100 px-4 py-3" key={requirement.label}><span className={`grid h-5 w-5 place-items-center rounded-full text-xs ${requirement.completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{requirement.completed ? "✓" : "·"}</span><span className={requirement.completed ? "text-sm text-slate-700" : "text-sm text-slate-500"}>{requirement.label}</span></div>)}</div></Card><Card className="h-fit p-6"><p className="text-sm font-medium text-slate-500">Current earnings</p><p className="mt-2 text-3xl font-bold text-slate-950">{formatCurrency(student.earnings)}</p><p className="mt-3 text-sm leading-6 text-slate-500">Tier criteria are mock rules for Week 5 and will become configurable later.</p></Card></div>
    </div>
  );
}
