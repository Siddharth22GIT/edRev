import type { Allocation, DeliveryRecord } from "@edurev/types";
import { allocations as mockAllocations, getOpportunity as mockGetOpportunity, students as mockStudents } from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { AllocationModel, OpportunityModel, StudentModel } from "../models/index.js";

function httpError(message: string, statusCode: number) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** Delivered by the end of the opportunity's due date counts as on time. */
function isOnTime(deliveredAt: Date, deadline: string | undefined): boolean {
  if (!deadline) return true;
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return true;
  // Date-only deadlines ("2026-09-20") are due by the end of that day
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) due.setUTCHours(23, 59, 59, 999);
  return deliveredAt.getTime() <= due.getTime();
}

/**
 * Staff confirm that allocated work was delivered. Records when, by whom and whether it was on time,
 * and counts it as a completed project for the student. A delivery can only be confirmed once.
 */
export async function confirmDeliveryService(opportunityId: string, confirmedBy: string, deliveredAtInput?: string): Promise<Allocation> {
  const deliveredAt = deliveredAtInput ? new Date(deliveredAtInput) : new Date();

  if (isDbConnected()) {
    const allocation = await AllocationModel.findOne({ opportunityId });
    if (!allocation) throw httpError("This opportunity has not been allocated yet.", 404);
    if (allocation.status === "COMPLETED") throw httpError("Delivery was already confirmed for this work.", 409);
    if (deliveredAt.getTime() < new Date(allocation.allocatedAt).getTime()) throw httpError("Delivery date cannot be before the work was allocated.", 400);

    const opportunity = await OpportunityModel.findOne({ id: opportunityId }).lean<{ deadline?: string }>();
    allocation.set({
      status: "COMPLETED",
      slaStatus: "COMPLETED",
      deliveredAt: deliveredAt.toISOString(),
      deliveryConfirmedBy: confirmedBy,
      onTime: isOnTime(deliveredAt, opportunity?.deadline),
    });
    await allocation.save();
    await StudentModel.updateOne({ id: allocation.studentId }, { $inc: { projectsCompleted: 1 } });
    const { _id, __v, ...rest } = allocation.toObject();
    return rest as Allocation;
  }

  const allocation = mockAllocations.find((a) => a.opportunityId === opportunityId);
  if (!allocation) throw httpError("This opportunity has not been allocated yet.", 404);
  if (allocation.status === "COMPLETED") throw httpError("Delivery was already confirmed for this work.", 409);
  if (deliveredAt.getTime() < new Date(allocation.allocatedAt).getTime()) throw httpError("Delivery date cannot be before the work was allocated.", 400);
  Object.assign(allocation, {
    status: "COMPLETED",
    slaStatus: "COMPLETED",
    deliveredAt: deliveredAt.toISOString(),
    deliveryConfirmedBy: confirmedBy,
    onTime: isOnTime(deliveredAt, mockGetOpportunity(opportunityId)?.deadline),
  });
  const student = mockStudents.find((s) => s.id === allocation.studentId);
  if (student) student.projectsCompleted += 1;
  return allocation;
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
