import type { Allocation, DeliveryRecord } from "@edurev/types";
import { allocations as mockAllocations } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AllocationModel } from "../models/index.js";
import { completeAllocation } from "./sla.service.js";
import { deadlineInstant } from "../utils/time.js";

/**
 * D6 / E9: on time = delivered by the agreed deadline. The agreed deadline is the allocation's `slaDeadline`
 * (fixed at allocation), but never earlier than the client's due date, so older allocations whose SLA date
 * was an automatic default aren't judged more strictly than the client asked. Date-only values end at
 * midnight in the institution's timezone (not UTC).
 */
export function isOnTime(deliveredAt: Date, clientDeadline: string | undefined, agreedDeadline: string | undefined, timeZone: string): boolean {
  const dues = [deadlineInstant(clientDeadline, timeZone), deadlineInstant(agreedDeadline, timeZone)].filter((d): d is Date => d !== null);
  if (dues.length === 0) return true;
  const due = Math.max(...dues.map((d) => d.getTime()));
  return deliveredAt.getTime() <= due;
}

/**
 * Staff confirm that allocated work was delivered. Records when, by whom and whether it was on time,
 * and counts it as a completed project for the student. A delivery can only be confirmed once.
 * Phase 4 (F2c): the same atomic completion as "Accept" (sla.service `completeAllocation`): only a live
 * allocation can complete, so two confirmations at once count the project once; cancelled work is refused.
 * A submission still waiting for review is marked accepted with it.
 */
export async function confirmDeliveryService(opportunityId: string, confirmedBy: string, deliveredAtInput?: string): Promise<Allocation> {
  const deliveredAt = deliveredAtInput ? new Date(deliveredAtInput) : new Date();
  const now = new Date().toISOString();
  if (isDbConnected()) {
    const pending = { "submissions.$[s].decision": "ACCEPTED", "submissions.$[s].decidedBy": confirmedBy, "submissions.$[s].decidedAt": now };
    const current = await AllocationModel.findOne({ opportunityId }, { submissions: 1 }).lean<Allocation>();
    const hasPending = (current?.submissions ?? []).some((s) => !s.decision);
    return completeAllocation(opportunityId, confirmedBy, deliveredAt, hasPending ? pending : {}, {}, hasPending ? [{ "s.decision": { $exists: false } }] : undefined);
  }
  const saved = await completeAllocation(opportunityId, confirmedBy, deliveredAt);
  for (const s of saved.submissions ?? []) if (!s.decision) Object.assign(s, { decision: "ACCEPTED", decidedBy: confirmedBy, decidedAt: now });
  return saved;
}

/** Completed / on-time / active counts for a student, from confirmed deliveries. */
export async function getDeliveryRecordService(studentId: string): Promise<DeliveryRecord> {
  const list: Allocation[] = isDbConnected()
    ? await AllocationModel.find({ studentId }).lean<Allocation[]>()
    : mockAllocations.filter((a) => a.studentId === studentId);

  const completed = list.filter((a) => a.status === "COMPLETED");
  const onTime = completed.filter((a) => a.onTime).length;
  return {
    studentId,
    completed: completed.length,
    onTime,
    onTimeRate: completed.length ? Math.round((onTime / completed.length) * 100) : 0,
    active: list.filter((a) => a.status !== "COMPLETED" && a.status !== "CANCELLED").length,
  };
}
