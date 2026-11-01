"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { INTEREST_AREAS, type PortfolioLink, type StudentReadinessSummary } from "@edurev/types";
import { PhotoUploader } from "@/components/profile/photo-uploader";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconArrowRight, IconCamera, IconCheckCircle, IconPlus, IconShield, IconX } from "@/components/ui/icons";
import { LogoMark } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { useMyProfile } from "@/lib/my-profile";
import { useToast } from "@/lib/toast";

const STEPS = ["Photo", "Skills", "Academics", "Goals", "Review"] as const;
const MAX_HOURS = 20;

const field =
  "mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-4 py-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:bg-white focus:ring-2 focus:ring-[#C2DCF2]";

function isPublicLink(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/**
 * First-login onboarding: photo → skills & interests → academics & availability → goals & links → review.
 * Saving never changes official records; a tier suggestion (if any) goes to an administrator for review.
 */
export function OnboardingWizard() {
  const router = useRouter();
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const { student, setStudent, loading } = useMyProfile();

  const [step, setStep] = useState(-1); // -1 = welcome
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [claimedCgpa, setClaimedCgpa] = useState("");
  const [hours, setHours] = useState(10);
  const [goals, setGoals] = useState("");
  const [links, setLinks] = useState<PortfolioLink[]>([]);
  const [officialCgpa, setOfficialCgpa] = useState<number | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ suggestedTier: string } | null | undefined>(undefined);
  const [prefilled, setPrefilled] = useState(false);

  // Pre-fill with anything the student already has, so the wizard also works as "update my answers"
  useEffect(() => {
    if (!student || prefilled) return;
    setSkills(student.skills ?? []);
    setInterests(student.interests ?? []);
    setClaimedCgpa(student.claimedCgpa !== undefined ? String(student.claimedCgpa) : "");
    setHours(student.availabilityHours ?? 10);
    setGoals(student.goals ?? "");
    setLinks(student.portfolioLinks ?? []);
    setPrefilled(true);
    apiFetch(`/students/${student.id}/readiness`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: StudentReadinessSummary } | null) => setOfficialCgpa(json?.data?.academic?.cgpa ?? student.cgpa))
      .catch(() => setOfficialCgpa(student.cgpa));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student]);

  if (loading || !student) {
    return (
      <Shell>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-4 h-40 w-full" />
      </Shell>
    );
  }

  const cgpaValue = claimedCgpa.trim() === "" ? undefined : Number(claimedCgpa);
  const cgpaValid = cgpaValue === undefined || (Number.isFinite(cgpaValue) && cgpaValue >= 0 && cgpaValue <= 10);
  const linksValid = links.every((l) => l.label.trim() && isPublicLink(l.url));
  const stepValid = [true, skills.length >= 1 && interests.length >= 1, cgpaValid && hours >= 1 && hours <= MAX_HOURS, linksValid && goals.length <= 300, true];

  const addSkill = () => {
    const value = skillDraft.trim();
    if (!value) return;
    if (value.length > 40) return toast("Keep each skill under 40 characters.", "error");
    if (skills.length >= 20) return toast("You can list up to 20 skills.", "error");
    if (!skills.some((s) => s.toLowerCase() === value.toLowerCase())) setSkills([...skills, value]);
    setSkillDraft("");
  };

  const skip = async () => {
    try {
      const res = await apiFetch(`/students/${student.id}/onboarding/skip`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setStudent(json.data);
      toast("No problem. You can finish setting up from your profile any time.", "info");
      router.replace("/dashboard");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not skip right now.", "error");
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/students/${student.id}/onboarding`, {
        method: "PUT",
        body: JSON.stringify({
          skills,
          interests,
          availabilityHours: hours,
          goals: goals.trim(),
          portfolioLinks: links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
          ...(cgpaValue !== undefined ? { claimedCgpa: cgpaValue } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not save your answers.");
      setStudent(json.data);
      setDone(json.tierReview ? { suggestedTier: json.tierReview.suggestedTier } : null);
      celebrate();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save your answers.", "error");
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- Finished ---------------- */
  if (done !== undefined) {
    return (
      <Shell>
        <div className="text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <IconCheckCircle size={30} />
          </span>
          <h1 className="mt-5 text-2xl font-extrabold text-[#30343B]">You&apos;re all set, {student.name.split(" ")[0]}!</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#666D7A]">Your profile is ready and your skills will be used to match you with opportunities.</p>
          {done && (
            <div className="mx-auto mt-6 max-w-md rounded-xl border border-[#FBD7B3] bg-[#FEF6EE] p-4 text-left text-sm text-[#30343B]">
              <p className="font-bold text-[#C27803]">Tier review requested</p>
              <p className="mt-1 text-xs leading-relaxed text-[#666D7A]">
                Based on your record, an administrator will review you for <strong className="text-[#30343B]">{done.suggestedTier.replace("_", " ")}</strong>. Your official tier only
                changes if they approve it.
              </p>
            </div>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button onClick={() => router.replace("/dashboard")} variant="primary">
              Go to my dashboard <IconArrowRight size={14} />
            </Button>
            <Link href="/profile">
              <Button variant="secondary">View my profile</Button>
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  /* ---------------- Welcome ---------------- */
  if (step === -1) {
    return (
      <Shell>
        <div className="text-center">
          <Avatar initials={student.avatarInitials} name={student.name} photoUrl={student.photoUrl} ring size={96} />
          <h1 className="mt-5 text-2xl font-extrabold text-[#30343B]">Welcome, {student.name.split(" ")[0]}! 👋</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#666D7A]">
            Let&apos;s set up your profile. It takes about two minutes and helps us match you with the right client work.
          </p>
          <ul className="mx-auto mt-6 grid max-w-md gap-2 text-left text-sm">
            {["Add a photo and your skills", "Tell us your interests and weekly availability", "Share your goals and portfolio links"].map((item) => (
              <li className="flex items-center gap-2.5 rounded-xl bg-[#F7F7F6] px-3.5 py-2.5 font-semibold text-[#30343B]" key={item}>
                <IconCheckCircle className="text-[#F2A65A]" size={16} />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button className="px-6 py-2.5" onClick={() => setStep(0)} variant="primary">
              Let&apos;s start <IconArrowRight size={14} />
            </Button>
            <button className="text-xs font-bold text-[#8C93A0] hover:text-[#30343B]" onClick={skip} type="button">
              I&apos;ll do this later
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  /* ---------------- Steps ---------------- */
  return (
    <Shell>
      <StepProgress current={step} />

      <div className="rise-in mt-8" key={step}>
        {step === 0 && (
          <StepBody hint="A friendly photo helps mentors and clients recognise you. You can skip this." title="Add a profile photo">
            <div className="flex flex-col items-center">
              <Avatar initials={student.avatarInitials} name={student.name} photoUrl={student.photoUrl} ring size={140} />
              <Button className="mt-5" onClick={() => setPhotoOpen(true)} variant="secondary">
                <IconCamera size={16} /> {student.photoUrl ? "Change photo" : "Choose a photo"}
              </Button>
            </div>
          </StepBody>
        )}

        {step === 1 && (
          <StepBody hint="Skills are matched against opportunity requirements. Pick at least one interest." title="Your skills & interests">
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF6EE] py-1.5 pl-3.5 pr-1.5 text-sm font-bold text-[#C27803] ring-1 ring-[#FBD7B3]" key={skill}>
                  {skill}
                  <button aria-label={`Remove ${skill}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-[#F2A65A] hover:text-white" onClick={() => setSkills(skills.filter((s) => s !== skill))} type="button">
                    <IconX size={12} />
                  </button>
                </span>
              ))}
              {skills.length === 0 && <span className="text-sm italic text-[#8C93A0]">No skills yet</span>}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addSkill();
              }}
            >
              <input aria-label="Add a skill" className={`${field} mt-0`} maxLength={40} onChange={(e) => setSkillDraft(e.target.value)} placeholder="e.g. React, Figma, SQL" value={skillDraft} />
              <Button type="submit" variant="secondary">
                <IconPlus size={14} /> Add
              </Button>
            </form>

            <p className="mt-6 text-xs font-bold uppercase tracking-wider text-[#666D7A]">Interests</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTEREST_AREAS.map((area) => {
                const on = interests.includes(area);
                return (
                  <button
                    aria-pressed={on}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${on ? "bg-[#3978B8] text-white" : "bg-white text-[#666D7A] ring-1 ring-[#E6E6E6] hover:ring-[#C2DCF2]"}`}
                    key={area}
                    onClick={() => setInterests(on ? interests.filter((i) => i !== area) : [...interests, area])}
                    type="button"
                  >
                    {on ? "✓ " : ""}
                    {area}
                  </button>
                );
              })}
            </div>
          </StepBody>
        )}

        {step === 2 && (
          <StepBody hint="Your official CGPA comes from the academic record and is what safeguards use." title="Academics & availability">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">Official CGPA</p>
                <p className="mt-1 text-2xl font-extrabold text-[#30343B]">{officialCgpa !== null ? officialCgpa.toFixed(2) : "…"}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-[#666D7A]">
                  <IconShield size={12} /> From your academic record
                </p>
              </div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">
                Latest CGPA you know (optional)
                <input className={field} inputMode="decimal" max={10} min={0} onChange={(e) => setClaimedCgpa(e.target.value)} placeholder="e.g. 8.4" step="0.01" type="number" value={claimedCgpa} />
                <span className="mt-1 block text-[11px] normal-case tracking-normal text-[#8C93A0]">
                  {cgpaValid ? "Shown as self-reported until the institution updates your record." : "Enter a number from 0 to 10."}
                </span>
              </label>
            </div>
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#666D7A]">
                <span>Hours you can give per week</span>
                <span className="text-base text-[#30343B]">{hours}h</span>
              </div>
              <input
                aria-label="Weekly availability in hours"
                className="mt-3 w-full accent-[#F2A65A]"
                max={MAX_HOURS}
                min={1}
                onChange={(e) => setHours(Number(e.target.value))}
                type="range"
                value={hours}
              />
              <p className="mt-1 text-[11px] text-[#8C93A0]">The institution caps work at {MAX_HOURS} hours a week to protect your studies.</p>
            </div>
          </StepBody>
        )}

        {step === 3 && (
          <StepBody hint="Links must be public web pages (GitHub, LinkedIn, Behance…). Never share passwords." title="Goals & portfolio">
            <label className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">
              What do you want to achieve this semester? <span className="normal-case tracking-normal text-[#8C93A0]">({goals.length}/300)</span>
              <textarea className={field} maxLength={300} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. Deliver my first paid client project and reach Tier 3." rows={3} value={goals} />
            </label>
            <p className="mt-5 text-xs font-bold uppercase tracking-wider text-[#666D7A]">Portfolio links ({links.length}/5)</p>
            <div className="mt-2 space-y-2">
              {links.map((link, i) => (
                <div className="flex gap-2" key={i}>
                  <input aria-label="Link label" className={`${field} mt-0 w-32 shrink-0`} maxLength={40} onChange={(e) => setLinks(links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))} placeholder="GitHub" value={link.label} />
                  <input
                    aria-label="Link address"
                    className={`${field} mt-0 ${link.url && !isPublicLink(link.url) ? "border-rose-300 ring-1 ring-rose-200" : ""}`}
                    maxLength={200}
                    onChange={(e) => setLinks(links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
                    placeholder="https://github.com/you"
                    value={link.url}
                  />
                  <button aria-label="Remove link" className="shrink-0 rounded-lg px-2 text-[#8C93A0] hover:bg-rose-50 hover:text-rose-600" onClick={() => setLinks(links.filter((_, j) => j !== i))} type="button">
                    <IconX size={16} />
                  </button>
                </div>
              ))}
              {links.length < 5 && (
                <button className="text-sm font-bold text-[#3978B8] hover:underline" onClick={() => setLinks([...links, { label: "", url: "" }])} type="button">
                  + Add a link
                </button>
              )}
            </div>
          </StepBody>
        )}

        {step === 4 && (
          <StepBody hint="You can change any of this later from your profile." title="Review & finish">
            <dl className="divide-y divide-[#E6E6E6] rounded-xl border border-[#E6E6E6] text-sm">
              <ReviewRow label="Photo" value={student.photoUrl ? "Added" : "Not yet"} />
              <ReviewRow label="Skills" value={skills.join(", ")} />
              <ReviewRow label="Interests" value={interests.join(", ")} />
              <ReviewRow label="CGPA" value={`Official ${officialCgpa?.toFixed(2) ?? "–"}${cgpaValue !== undefined ? ` · self-reported ${cgpaValue}` : ""}`} />
              <ReviewRow label="Availability" value={`${hours} hours / week`} />
              <ReviewRow label="Goals" value={goals.trim() || "–"} />
              <ReviewRow label="Links" value={links.length ? links.map((l) => l.label).join(", ") : "–"} />
            </dl>
          </StepBody>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-[#E6E6E6] pt-5">
        <Button onClick={() => setStep(step - 1)} variant="ghost">
          ← Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button disabled={!stepValid[step]} onClick={() => setStep(step + 1)} variant="primary">
            Continue <IconArrowRight size={14} />
          </Button>
        ) : (
          <Button disabled={saving || !stepValid.every(Boolean)} onClick={finish} variant="primary">
            {saving ? "Saving…" : "Finish setup"}
          </Button>
        )}
      </div>

      {photoOpen && <PhotoUploader onClose={() => setPhotoOpen(false)} onSaved={setStudent} student={student} />}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#30343B] via-[#2B3F58] to-[#204D7D] px-4 py-10">
      <div aria-hidden="true" className="login-blob absolute -left-24 top-10 h-80 w-80 rounded-full bg-[#F2A65A]/25 blur-3xl" />
      <div aria-hidden="true" className="login-blob absolute -right-16 bottom-10 h-96 w-96 rounded-full bg-[#3978B8]/35 blur-3xl [animation-delay:-6s]" />
      <svg aria-hidden="true" className="absolute inset-x-0 bottom-0 h-40 w-full opacity-30" preserveAspectRatio="none" viewBox="0 0 1200 160">
        <path d="M0 160 L180 70 L320 120 L520 30 L700 110 L880 50 L1060 120 L1200 80 L1200 160 Z" fill="#FBD7B3" />
      </svg>
      <div className="relative mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-center gap-2.5 text-white">
          <LogoMark className="rounded-xl ring-2 ring-white/20" size={36} />
          <span className="font-extrabold tracking-tight">REVALANCHE</span>
        </div>
        <div className="rise-in rounded-2xl border border-white/10 bg-white p-6 shadow-dropdown sm:p-8">{children}</div>
      </div>
    </div>
  );
}

function StepProgress({ current }: { current: number }) {
  const pct = ((current + 1) / STEPS.length) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold">
        <span className="uppercase tracking-wider text-[#C27803]">
          Step {current + 1} of {STEPS.length} · {STEPS[current]}
        </span>
        <span className="text-[#8C93A0]">{Math.round(pct)}%</span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-[#F1EFEC]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#F2A65A] to-[#3978B8] transition-all duration-500" style={{ width: `${pct}%` }} />
        <span className="absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-[#3978B8] shadow transition-all duration-500" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

function StepBody({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-extrabold text-[#30343B]">{title}</h1>
      <p className="mt-1 text-sm text-[#666D7A]">{hint}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      <dt className="w-24 shrink-0 text-xs font-bold uppercase tracking-wider text-[#666D7A]">{label}</dt>
      <dd className="font-semibold text-[#30343B]">{value}</dd>
    </div>
  );
}
