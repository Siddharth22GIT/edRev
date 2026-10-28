"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { can, PERMISSIONS, type Permission, type StudentReadinessSummary } from "@edurev/types";
import { PhotoUploader } from "@/components/profile/photo-uploader";
import { AboutCard, ProfileCompletenessCard } from "@/components/profile/profile-completeness-card";
import { currentStage, JourneyStepper, MountainProgress } from "@/components/student/journey";
import { Avatar } from "@/components/ui/avatar";
import { TierBadge } from "@/components/ui/tier-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RingStat } from "@/components/ui/ring-stat";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconArrowRight,
  IconCalendar,
  IconCamera,
  IconGraduationCap,
  IconMail,
  IconMapPin,
  IconPhone,
  IconPlus,
  IconShield,
  IconUser,
  IconUserCheck,
  IconX,
} from "@/components/ui/icons";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/format";
import { useMyProfile } from "@/lib/my-profile";
import { roleLabels } from "@/lib/navigation";
import { useQuickAction } from "@/lib/quick-actions";
import { useToast } from "@/lib/toast";

type ProfileTab = "overview" | "skills" | "journey" | "edit";

const tabs: { id: ProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "skills", label: "Skills" },
  { id: "journey", label: "Journey" },
  { id: "edit", label: "Edit profile" },
];

/** "My profile" from the avatar menu: a rich page for students, an account summary for staff. */
export function MyProfileScreen() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "STUDENT" ? <StudentProfile /> : <StaffProfile />;
}

/* ------------------------------------------------------------------ */
/* Shared header                                                      */
/* ------------------------------------------------------------------ */

function ProfileHeader({
  avatar,
  name,
  subtitle,
  badges,
  left,
  right,
}: {
  avatar: ReactNode;
  name: string;
  subtitle: ReactNode;
  badges?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      {/* Cover: brand gradient with the logo's mountain range */}
      <div className="relative h-36 overflow-hidden bg-gradient-to-br from-[#30343B] via-[#2B3F58] to-[#204D7D] sm:h-44">
        <div aria-hidden="true" className="login-blob absolute -left-10 -top-16 h-56 w-56 rounded-full bg-[#F2A65A]/30 blur-3xl" />
        <div aria-hidden="true" className="login-blob absolute -right-10 top-0 h-64 w-64 rounded-full bg-[#3978B8]/40 blur-3xl [animation-delay:-6s]" />
        <svg aria-hidden="true" className="absolute inset-x-0 bottom-0 h-24 w-full" preserveAspectRatio="none" viewBox="0 0 1200 96">
          <path d="M0 96 L150 46 L260 74 L420 18 L560 70 L700 34 L860 80 L1000 30 L1200 66 L1200 96 Z" fill="#3978B8" opacity="0.35" />
          <path d="M0 96 L120 70 L300 40 L470 82 L640 52 L820 88 L980 58 L1200 84 L1200 96 Z" fill="#FBD7B3" opacity="0.25" />
        </svg>
      </div>

      <div className="relative grid gap-4 px-6 pb-6 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
        <div className="order-2 hidden pt-4 text-center sm:order-1 sm:block">{left}</div>
        <div className="order-1 -mt-16 flex flex-col items-center text-center sm:order-2">
          {avatar}
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-[#30343B]">{name}</h1>
          <div className="mt-1 text-sm text-[#666D7A]">{subtitle}</div>
          {badges && <div className="mt-3 flex flex-wrap justify-center gap-2">{badges}</div>}
        </div>
        <div className="order-3 hidden pt-4 text-center sm:block">{right}</div>
      </div>
    </Card>
  );
}

function HeaderStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-extrabold text-[#30343B]">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Student                                                            */
/* ------------------------------------------------------------------ */

function StudentProfile() {
  const { apiFetch } = useApi();
  const { student, setStudent, loading: profileLoading } = useMyProfile();
  const [readiness, setReadiness] = useState<StudentReadinessSummary | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [tab, setTab] = useState<ProfileTab>(() => {
    if (typeof window !== "undefined") {
      const requested = new URLSearchParams(window.location.search).get("tab");
      if (tabs.some((t) => t.id === requested)) return requested as ProfileTab;
    }
    return "overview";
  });

  useQuickAction("change-photo", () => setPhotoOpen(true));

  useEffect(() => {
    if (!student?.id) return;
    apiFetch(`/students/${student.id}/readiness`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setReadiness(json?.data ?? null))
      .catch(() => setReadiness(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id]);

  if (profileLoading || !student) {
    return (
      <div className="space-y-6">
        <Card className="h-72 p-6">
          <Skeleton className="mx-auto mt-24 h-28 w-28 rounded-full" />
        </Card>
      </div>
    );
  }

  const officialCgpa = readiness?.academic?.cgpa ?? student.cgpa;
  const trainingPct = readiness?.training.progressPercentage ?? student.trainingProgress;
  const hoursUsed = readiness?.hours?.loggedHours ?? 0;
  const hoursAllowed = readiness?.hours?.allowedHours ?? 20;

  return (
    <div className="space-y-6">
      <ProfileHeader
        avatar={
          <div className="relative">
            <Avatar initials={student.avatarInitials} name={student.name} photoUrl={student.photoUrl} ring size={128} />
            <button
              aria-label="Change profile photo"
              className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full bg-[#F2A65A] text-[#30343B] shadow-md ring-4 ring-white transition hover:scale-105 hover:bg-[#E59443]"
              onClick={() => setPhotoOpen(true)}
              type="button"
            >
              <IconCamera size={16} />
            </button>
          </div>
        }
        badges={
          <>
            <TierBadge prefix="Official" tier={student.tier} />
            <Badge tone="blue">{student.course} · Year {student.year}</Badge>
            <Badge tone={readiness?.safeguardCheck.eligible === false ? "red" : "green"}>
              {readiness?.safeguardCheck.eligible === false ? "Action needed" : "Ready for work"}
            </Badge>
          </>
        }
        left={<HeaderStat label="Official CGPA" value={officialCgpa.toFixed(2)} />}
        name={student.name}
        right={<HeaderStat label="Training" value={`${trainingPct}%`} />}
        subtitle={
          <>
            {student.program} · <span className="font-semibold text-[#30343B]">{student.id}</span>
          </>
        }
      />

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[#E6E6E6] bg-white p-1 shadow-card" role="tablist">
        {tabs.map((t) => (
          <button
            aria-selected={tab === t.id}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition ${
              tab === t.id ? "bg-[#FEF6EE] text-[#30343B] ring-1 ring-[#FBD7B3]" : "text-[#666D7A] hover:text-[#30343B]"
            }`}
            key={t.id}
            onClick={() => setTab(t.id)}
            role="tab"
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <Card className="p-6">
            <h2 className="border-b border-[#E6E6E6] pb-3 font-bold text-[#30343B]">Personal information</h2>
            <ul className="mt-4 space-y-3.5 text-sm">
              <InfoRow icon={<IconUser size={16} />} value={student.name} />
              <InfoRow icon={<IconMail size={16} />} value={student.email} />
              <InfoRow icon={<IconPhone size={16} />} placeholder="Add a phone number" value={student.phone} />
              <InfoRow icon={<IconMapPin size={16} />} placeholder="Add your location" value={student.location} />
              <InfoRow icon={<IconUserCheck size={16} />} value={`Mentor: ${student.mentor}`} />
              <InfoRow icon={<IconCalendar size={16} />} value={`Joined ${formatDate(student.joinedAt)}`} />
            </ul>
            {student.bio ? (
              <p className="mt-5 rounded-xl bg-[#F7F7F6] p-3 text-sm leading-relaxed text-[#30343B]">{student.bio}</p>
            ) : (
              <button className="mt-5 text-xs font-bold text-[#3978B8] hover:underline" onClick={() => setTab("edit")} type="button">
                + Add a short bio
              </button>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="border-b border-[#E6E6E6] pb-3 font-bold text-[#30343B]">At a glance</h2>
            <div className="mt-6 grid gap-8 sm:grid-cols-3">
              <RingStat caption="Official record · out of 10" display={officialCgpa.toFixed(2)} label="CGPA" max={10} value={officialCgpa} />
              <RingStat caption={`${readiness?.training.completedCount ?? 0} of ${readiness?.training.totalCount ?? 0} modules`} color="#3978B8" display={`${trainingPct}%`} label="Training" value={trainingPct} />
              <RingStat
                caption={`of ${hoursAllowed}h weekly cap`}
                color={hoursUsed >= hoursAllowed ? "#E11D48" : "#10B981"}
                display={`${hoursUsed}h`}
                label="Hours this week"
                max={hoursAllowed}
                value={hoursUsed}
              />
            </div>
          </Card>
        </div>
      )}

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(280px,380px)]">
          <AboutCard officialCgpa={officialCgpa} student={student} />
          <ProfileCompletenessCard compact student={student} />
        </div>
      )}

      {tab === "skills" && <SkillsEditor />}

      {tab === "journey" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="font-bold text-[#30343B]">Your journey</h2>
            <div className="mt-5">
              <JourneyStepper stage={currentStage(student, trainingPct)} />
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="font-bold text-[#30343B]">Tier climb</h2>
            <div className="mt-4">
              <MountainProgress progress={trainingPct} tier={student.tier} />
            </div>
            <Link className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#3978B8] hover:underline" href={`/students/${student.id}`}>
              Training modules & readiness details <IconArrowRight size={14} />
            </Link>
          </Card>
        </div>
      )}

      {tab === "edit" && <EditProfileForm />}

      {photoOpen && <PhotoUploader onClose={() => setPhotoOpen(false)} onSaved={setStudent} student={student} />}
    </div>
  );
}

function InfoRow({ icon, value, placeholder }: { icon: ReactNode; value?: string; placeholder?: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#F7F7F6] text-[#3978B8]">{icon}</span>
      {value ? <span className="font-semibold text-[#30343B]">{value}</span> : <span className="italic text-[#8C93A0]">{placeholder}</span>}
    </li>
  );
}

function SkillsEditor() {
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const { student, setStudent } = useMyProfile();
  const [skills, setSkills] = useState<string[]>(student?.skills ?? []);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  if (!student) return null;

  const changed = skills.join("|") !== student.skills.join("|");

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (value.length > 40) return toast("Keep each skill under 40 characters.", "error");
    if (skills.length >= 20) return toast("You can list up to 20 skills.", "error");
    if (!skills.some((s) => s.toLowerCase() === value.toLowerCase())) setSkills([...skills, value]);
    setDraft("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/students/${student.id}/profile`, { method: "PATCH", body: JSON.stringify({ skills }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not save skills.");
      setStudent(json.data);
      toast("Skills saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save skills.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-[#30343B]">Skills</h2>
          <p className="mt-0.5 text-xs text-[#666D7A]">Shown on your profile and used to match you with opportunities. Up to 20.</p>
        </div>
        <Badge tone="blue">{skills.length} / 20</Badge>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {skills.length === 0 && <p className="text-sm italic text-[#8C93A0]">No skills yet. Add your first one below.</p>}
        {skills.map((skill) => (
          <span className="rise-in inline-flex items-center gap-1.5 rounded-full bg-[#FEF6EE] py-1.5 pl-3.5 pr-1.5 text-sm font-bold text-[#C27803] ring-1 ring-[#FBD7B3]" key={skill}>
            {skill}
            <button
              aria-label={`Remove ${skill}`}
              className="grid h-5 w-5 place-items-center rounded-full text-[#C27803] hover:bg-[#F2A65A] hover:text-white"
              onClick={() => setSkills(skills.filter((s) => s !== skill))}
              type="button"
            >
              <IconX size={12} />
            </button>
          </span>
        ))}
      </div>

      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          aria-label="New skill"
          className="flex-1 rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-4 py-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:bg-white focus:ring-2 focus:ring-[#C2DCF2]"
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. React, Figma, SQL"
          value={draft}
        />
        <Button type="submit" variant="secondary">
          <IconPlus size={14} /> Add
        </Button>
      </form>

      <div className="mt-6 flex justify-end gap-2 border-t border-[#E6E6E6] pt-4">
        <Button disabled={!changed || saving} onClick={() => setSkills(student.skills)} variant="ghost">
          Reset
        </Button>
        <Button disabled={!changed || saving} onClick={save} variant="primary">
          {saving ? "Saving…" : "Save skills"}
        </Button>
      </div>
    </Card>
  );
}

function EditProfileForm() {
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const { student, setStudent } = useMyProfile();
  const [bio, setBio] = useState(student?.bio ?? "");
  const [phone, setPhone] = useState(student?.phone ?? "");
  const [location, setLocation] = useState(student?.location ?? "");
  const [saving, setSaving] = useState(false);
  if (!student) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch(`/students/${student.id}/profile`, { method: "PATCH", body: JSON.stringify({ bio, phone, location }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not save your profile.");
      setStudent(json.data);
      toast("Profile saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save your profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-4 py-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:bg-white focus:ring-2 focus:ring-[#C2DCF2]";

  return (
    <Card className="p-6">
      <h2 className="font-bold text-[#30343B]">Edit profile</h2>
      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={save}>
        <label className="text-xs font-bold uppercase tracking-wider text-[#666D7A] md:col-span-2">
          Bio <span className="normal-case tracking-normal text-[#8C93A0]">({bio.length}/500)</span>
          <textarea className={field} maxLength={500} onChange={(e) => setBio(e.target.value)} placeholder="A line or two about you and the work you enjoy." rows={3} value={bio} />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">
          Phone
          <input className={field} inputMode="tel" maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" value={phone} />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">
          Location
          <input className={field} maxLength={80} onChange={(e) => setLocation(e.target.value)} placeholder="City, State" value={location} />
        </label>
        <div className="flex flex-col gap-3 border-t border-[#E6E6E6] pt-4 md:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-xs text-[#666D7A]">
            <IconShield className="text-[#3978B8]" size={14} />
            Name, email, CGPA and tier are managed by the institution.
          </p>
          <Button disabled={saving} type="submit" variant="primary">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Staff                                                              */
/* ------------------------------------------------------------------ */

const permissionLabels: Partial<Record<Permission, string>> = {
  OPPORTUNITY_CREATE: "Publish opportunities",
  OPPORTUNITY_ALLOCATE: "Allocate work to students",
  BID_REVIEW: "Review bids and proposal documents",
  STUDENT_RECORDS_VIEW: "View student profiles and readiness",
  STUDENT_SUPERVISE: "Supervise training and log hours",
  TIER_UPDATE: "Change official tiers",
  HOUR_CAP_OVERRIDE: "Override the weekly hour cap",
  EARNINGS_VIEW_ALL: "View the earnings ledger",
  EARNINGS_VERIFY: "Verify or reject earnings",
  PROFILE_EDIT_ANY: "Edit any student profile",
  PROPOSAL_CREATE: "Create proposals",
};

function StaffProfile() {
  const { user } = useAuth();
  if (!user) return null;
  const abilities = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => permissionLabels[p] && can(user.role, p));

  return (
    <div className="space-y-6">
      <ProfileHeader
        avatar={<Avatar name={user.name} ring size={128} />}
        badges={<Badge tone="orange">{roleLabels[user.role]}</Badge>}
        name={user.name}
        subtitle={user.email}
      />
      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-bold text-[#30343B]">
          <IconGraduationCap className="text-[#3978B8]" size={18} />
          What you can do
        </h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {abilities.map((p) => (
            <li className="flex items-center gap-2 rounded-xl bg-[#F7F7F6] px-3 py-2.5 text-sm font-semibold text-[#30343B]" key={p}>
              <span className="h-2 w-2 rounded-full bg-[#F2A65A]" />
              {permissionLabels[p]}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
