import type { Student, Tier } from "@edurev/types";
import { IconCheckCircle } from "@/components/ui/icons";

const STAGES = ["Train", "Bid", "Earn", "Grow"] as const;
type Stage = (typeof STAGES)[number];

/**
 * Where a student is on the Train → Bid → Earn → Grow path, from fields the profile already has:
 * training ≥ 60% (the tier requirement), at least one completed project, and verified earnings.
 */
export function currentStage(student: Pick<Student, "trainingProgress" | "projectsCompleted" | "earnings">, trainingPct?: number): Stage {
  const training = trainingPct ?? student.trainingProgress;
  if (training < 60) return "Train";
  if (student.projectsCompleted < 1) return "Bid";
  if (student.earnings <= 0) return "Earn";
  return "Grow";
}

const stageHint: Record<Stage, string> = {
  Train: "Complete training to 60% to unlock bidding readiness",
  Bid: "Bid on an opportunity that matches your tier",
  Earn: "Log earnings from your work for verification",
  Grow: "Keep delivering to progress toward the next tier",
};

/** Four-step progress stepper (mirrors the login page's journey pill). */
export function JourneyStepper({ stage }: { stage: Stage }) {
  const activeIndex = STAGES.indexOf(stage);
  return (
    <div>
      <ol className="flex items-center">
        {STAGES.map((name, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li className="flex flex-1 items-center last:flex-none" key={name}>
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full text-xs font-extrabold transition ${
                    done
                      ? "bg-[#3978B8] text-white"
                      : active
                        ? "bg-[#F2A65A] text-[#30343B] ring-4 ring-[#FBD7B3]"
                        : "bg-[#F7F7F6] text-[#8C93A0] ring-1 ring-[#E6E6E6]"
                  }`}
                >
                  {done ? <IconCheckCircle size={16} /> : i + 1}
                </span>
                <span className={`text-[11px] font-bold ${active ? "text-[#C27803]" : done ? "text-[#2F659C]" : "text-[#8C93A0]"}`}>{name}</span>
              </div>
              {i < STAGES.length - 1 && (
                <span className={`mx-2 mb-5 h-0.5 flex-1 rounded-full ${i < activeIndex ? "bg-[#3978B8]" : "bg-[#E6E6E6]"}`} />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs font-semibold text-[#666D7A]">{stageHint[stage]}</p>
    </div>
  );
}

function nextTier(tier: Tier): Tier | null {
  const rank = Number(tier.split("_")[1]);
  return rank < 4 ? (`TIER_${rank + 1}` as Tier) : null;
}

/** Tier progress drawn as a climb up the logo's mountain. */
export function MountainProgress({ tier, progress }: { tier: Tier; progress: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress)));
  const next = nextTier(tier);
  // Climber follows the left ridge from the base (10,86) to the summit (100,16)
  const x = 10 + (90 * pct) / 100;
  const y = 86 - (70 * pct) / 100;

  return (
    <div className="flex items-center gap-4">
      <svg aria-hidden="true" className="h-24 w-36 shrink-0" viewBox="0 0 180 96">
        <path d="M60 96 L120 30 L180 96 Z" fill="#C2DCF2" />
        <path d="M0 96 L100 16 L170 96 Z" fill="#E6E6E6" />
        <path d="M10 86 L100 16" fill="none" stroke="#F2A65A" strokeDasharray={`${(pct / 100) * 114} 200`} strokeLinecap="round" strokeWidth="4" />
        <path d="M100 16 L92 23 L97 22 L100 25 L104 21 L108 23 Z" fill="#FEF6EE" stroke="#FBD7B3" strokeWidth="1" />
        <circle cx={x} cy={y} fill="#3978B8" r="6" stroke="#FFFFFF" strokeWidth="2.5" />
      </svg>
      <div>
        <p className="text-2xl font-extrabold text-[#30343B]">{pct}%</p>
        <p className="text-xs font-semibold text-[#666D7A]">{next ? `of the climb to ${next.replace("_", " ")}` : "Top tier reached"}</p>
        <p className="mt-1 text-[11px] text-[#8C93A0]">Official tier changes are made by an Administrator.</p>
      </div>
    </div>
  );
}
