import { escalateHelpRequestsService } from "./help.service.js";
import { autoCheckinsService } from "./hours.service.js";
import { evaluateTierSuggestionService, listTierSuggestionsService } from "./onboarding.service.js";
import { recordDailyRunService } from "./safeguard.service.js";
import { sendSlaRemindersService } from "./sla.service.js";

// Phase 4 (G12): the daily checks. Every step is idempotent (safe to run any number of times, even two at once),
// so the server simply runs them every hour. Doc: docs/modules/sla-and-delivery.md §2.4

export interface DailyCheckSummary {
  remindersSent: number;
  autoCheckins: number;
  helpEscalated: number;
  staleTierSuggestions: number;
}

/**
 * 1. SLA reminders (48 h, 24 h, at risk, overdue, kick-off), each once per deadline.
 * 2. Missed weekly check-ins → filled with the planned hours + one reminder.
 * 3. Help requests unanswered for 2 working days → escalated.
 * 4. H2: pending tier suggestions whose criteria are no longer met → withdrawn by the system.
 * `onlyStudentIds` limits a run to some students (an Administrator re-checking one student, and the tests).
 */
export async function runDailyChecks(options: { now?: Date; onlyStudentIds?: string[] } = {}): Promise<DailyCheckSummary> {
  const now = options.now ?? new Date();
  const scope = options.onlyStudentIds;
  const summary: DailyCheckSummary = { remindersSent: 0, autoCheckins: 0, helpEscalated: 0, staleTierSuggestions: 0 };

  // Each step runs even when another one fails, so one bad record never stops the rest
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      console.warn(`[daily-checks] ${name} failed: ${(error as Error).message}`);
    }
  };

  await step("reminders", async () => {
    summary.remindersSent = (await sendSlaRemindersService(now, scope)).sent;
  });
  await step("check-ins", async () => {
    summary.autoCheckins = (await autoCheckinsService(now, scope)).created;
  });
  await step("help escalation", async () => {
    summary.helpEscalated = (await escalateHelpRequestsService(now, scope)).escalated;
  });
  await step("tier suggestions", async () => {
    for (const s of await listTierSuggestionsService("PENDING")) {
      if (scope && !scope.includes(s.studentId)) continue;
      const after = await evaluateTierSuggestionService(s.studentId);
      if (!after) summary.staleTierSuggestions++;
    }
  });

  if (!scope) await step("record run", () => recordDailyRunService({ ...summary }));
  return summary;
}

let timer: NodeJS.Timeout | null = null;

/** Starts the hourly schedule (first run a minute after start-up). The server calls this; tests don't. */
export function scheduleDailyChecks(intervalMs = 60 * 60 * 1000): void {
  if (timer || process.env.DAILY_CHECKS === "off") return;
  const run = () => {
    runDailyChecks()
      .then((s) => console.log(`[daily-checks] reminders ${s.remindersSent}, auto check-ins ${s.autoCheckins}, escalated ${s.helpEscalated}, stale tier suggestions ${s.staleTierSuggestions}`))
      .catch((error) => console.warn(`[daily-checks] ${(error as Error).message}`));
  };
  setTimeout(run, 60_000).unref();
  timer = setInterval(run, intervalMs);
  timer.unref();
}
