"use client";

import { skillMatch, type Opportunity, type SafeguardCheck, type StudentReadinessSummary } from "@edurev/types";
import { Card } from "@/components/ui/card";
import { SkeletonRows } from "@/components/ui/skeleton";
import { IconShield } from "@/components/ui/icons";
import { RuleList } from "@/components/safeguards/rule-list";
import { useAuth } from "@/lib/auth-context";
import { useResource } from "@/lib/use-resource";

// G6 + F4: before bidding, a student sees whether they could be allocated this work right now (every rule,
// what unlocks it, "Request help") and how their skills match it ("4 of 5 skills").

export function EligibilityCard({ opportunity }: { opportunity: Opportunity }) {
  const { user } = useAuth();
  const me = user!.studentId || user!.id;
  const check = useResource<SafeguardCheck>(`/safeguards/${me}?opportunityId=${encodeURIComponent(opportunity.id)}`);
  const readiness = useResource<StudentReadinessSummary>(`/students/${me}/readiness`);

  const student = readiness.data?.student;
  const done = (readiness.data?.training.modules ?? []).filter((m) => m.status === "COMPLETED").map((m) => m.title);
  const match = student ? skillMatch(student.skills, opportunity.skills, done) : null;
  const hours = check.data?.hours;

  return (
    <Card className="space-y-4 p-6" id="eligibility">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-orange-dark">
            <IconShield size={13} /> Before you bid
          </p>
          <h2 className="mt-0.5 text-base font-bold text-brand-text">Could this work be allocated to you now?</h2>
        </div>
        {check.data && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${check.data.eligible ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
            {check.data.eligible ? "Yes, you're eligible" : "Not right now"}
          </span>
        )}
      </div>

      {match && (
        <div className="rounded-lg border border-brand-border bg-brand-bg px-3 py-2.5">
          <p className="text-sm font-bold text-brand-text">
            Skill match: <span className="nums">{match.label}</span>
          </p>
          {match.total > 0 && (
            <p className="mt-0.5 text-xs text-brand-text-muted">
              {match.matched.length > 0 && <>You list {match.matched.join(", ")}. </>}
              {match.missing.length > 0 && <>Not on your profile yet: {match.missing.join(", ")}.</>}
              {student && student.skills.length === 0 && <> Add skills on your profile to see a better match.</>}
            </p>
          )}
        </div>
      )}

      {hours && hours.candidateHours !== undefined && (
        <p className="text-xs text-brand-text-muted">
          This work needs about <span className="nums font-bold text-brand-text">{hours.candidateHours} h/week</span>. You have{" "}
          <span className="nums font-bold text-brand-text">{hours.usedHours} h</span> planned of your <span className="nums">{hours.cap} h</span> weekly cap.
        </p>
      )}

      {check.loading ? (
        <SkeletonRows rows={2} />
      ) : check.error ? (
        <p className="text-xs text-rose-800">
          {check.error}{" "}
          <button className="font-bold underline" onClick={check.retry} type="button">
            Retry
          </button>
        </p>
      ) : (
        check.data?.rules && <RuleList canAskHelp onHelpSent={check.retry} opportunityId={opportunity.id} rules={check.data.rules} />
      )}
      <p className="text-[11px] text-brand-text-muted">You can still bid while blocked; staff can only allocate the work once every block is cleared.</p>
    </Card>
  );
}
