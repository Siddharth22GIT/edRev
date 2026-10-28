"use client";

import Link from "next/link";
import type { Student } from "@edurev/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconArrowRight, IconCheckCircle } from "@/components/ui/icons";
import { profileCompleteness } from "@/lib/profile-completeness";

/** "Profile 70% complete" with the next few things to add. Renders nothing once the profile is complete. */
export function ProfileCompletenessCard({ student, compact = false }: { student: Student; compact?: boolean }) {
  const { percent, missing } = profileCompleteness(student);
  if (missing.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#C27803]">Profile {percent}% complete</p>
          <p className="mt-0.5 text-sm font-bold text-[#30343B]">{student.onboardingCompletedAt ? "A few more details help you stand out" : "Finish setting up your profile"}</p>
        </div>
        {!student.onboardingCompletedAt && (
          <Link className="shrink-0" href="/onboarding">
            <Button className="text-xs" variant="primary">
              Finish setup <IconArrowRight size={14} />
            </Button>
          </Link>
        )}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F1EFEC]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#F2A65A] to-[#3978B8] transition-all duration-700" style={{ width: `${percent}%` }} />
      </div>
      <ul className={`mt-3 grid gap-1.5 ${compact ? "" : "sm:grid-cols-2"}`}>
        {missing.slice(0, compact ? 3 : missing.length).map((item) => (
          <li key={item.label}>
            <Link className="group flex items-center gap-2 text-xs font-semibold text-[#666D7A] hover:text-[#3978B8]" href={item.href}>
              <span className="h-4 w-4 shrink-0 rounded-full border-2 border-[#D1D5DB] group-hover:border-[#3978B8]" />
              {item.label}
            </Link>
          </li>
        ))}
        {compact && missing.length > 3 && <li className="text-xs text-[#8C93A0]">+{missing.length - 3} more on your profile</li>}
      </ul>
    </Card>
  );
}

/** Interests, goals, availability, links and self-reported CGPA, as entered during onboarding. */
export function AboutCard({ student, officialCgpa }: { student: Student; officialCgpa: number }) {
  const hasAnything = Boolean(student.interests?.length || student.goals || student.availabilityHours || student.portfolioLinks?.length || student.claimedCgpa !== undefined);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between border-b border-[#E6E6E6] pb-3">
        <h2 className="font-bold text-[#30343B]">About</h2>
        <Link className="text-xs font-bold text-[#3978B8] hover:underline" href="/onboarding">
          {hasAnything ? "Update answers" : "Add details"}
        </Link>
      </div>
      {!hasAnything ? (
        <p className="mt-4 text-sm italic text-[#8C93A0]">Tell us your interests, goals and portfolio links to get better-matched opportunities.</p>
      ) : (
        <dl className="mt-4 space-y-4 text-sm">
          {student.interests && student.interests.length > 0 && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">Interests</dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {student.interests.map((interest) => (
                  <span className="rounded-full bg-[#EFF6FC] px-3 py-1 text-xs font-bold text-[#2F659C] ring-1 ring-[#C2DCF2]" key={interest}>
                    {interest}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {student.goals && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">Goals</dt>
              <dd className="mt-1 text-[#30343B]">{student.goals}</dd>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {student.availabilityHours !== undefined && (
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">Availability</dt>
                <dd className="mt-1 font-semibold text-[#30343B]">{student.availabilityHours} hours / week</dd>
              </div>
            )}
            {student.claimedCgpa !== undefined && (
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">Self-reported CGPA</dt>
                <dd className="mt-1 font-semibold text-[#30343B]">
                  {student.claimedCgpa.toFixed(2)} <span className="text-xs font-normal text-[#8C93A0]">· official {officialCgpa.toFixed(2)}</span>
                </dd>
              </div>
            )}
          </div>
          {student.portfolioLinks && student.portfolioLinks.length > 0 && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">Portfolio</dt>
              <dd className="mt-1.5 flex flex-wrap gap-2">
                {student.portfolioLinks.map((link) => (
                  <a
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#30343B] ring-1 ring-[#E6E6E6] transition hover:ring-[#F2A65A]"
                    href={link.url}
                    key={link.url}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                  >
                    <IconCheckCircle className="text-[#F2A65A]" size={12} />
                    {link.label} ↗
                  </a>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
    </Card>
  );
}
