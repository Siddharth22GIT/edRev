import type { AcademicSnapshot, AnalyticsSnapshot, DashboardMetrics, Proposal, SettingsSummary } from "@edurev/types";
import {
  academicSnapshots as mockAcademicSnapshots,
  analytics as mockAnalytics,
  dashboardMetrics as mockDashboardMetrics,
  proposals as mockProposals,
  settings as mockSettings,
  students as mockStudents,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import {
  AcademicSnapshotModel,
  AllocationModel,
  BidModel,
  EarningsEntryModel,
  OpportunityModel,
  ProposalModel,
  SettingsModel,
  StudentModel,
} from "../models/index.js";

function getCurrentWeekDays(): Array<{ dateStr: string; label: string }> {
  const now = new Date();
  const currentDay = now.getDay();
  const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;

  const monday = new Date(now);
  monday.setDate(now.getDate() + distanceToMonday);
  monday.setHours(0, 0, 0, 0);

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days: Array<{ dateStr: string; label: string }> = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    days.push({ dateStr, label: dayLabels[i] });
  }

  return days;
}

export async function getDashboardMetricsService(): Promise<DashboardMetrics> {
  if (isDbConnected()) {
    const activeStudents = await StudentModel.countDocuments({ status: "ACTIVE" });
    const opportunityPipeline = await OpportunityModel.countDocuments({ status: { $in: ["OPEN", "UNDER_REVIEW"] } });
    const verifiedEarningsList = await EarningsEntryModel.find({ verificationStatus: "VERIFIED" }).lean();
    const verifiedEarnings = Number(
      verifiedEarningsList.reduce((acc, curr) => acc + (curr.convertedAmount || 0), 0).toFixed(2)
    );
    const totalBids = await BidModel.countDocuments();
    const allocations = await AllocationModel.countDocuments();

    // Calendar month verified earnings calculation
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlyVerifiedList = verifiedEarningsList.filter((e) => {
      const dateStr = e.verifiedAt || e.earningDate || e.createdAt;
      return dateStr && dateStr.startsWith(currentMonthPrefix);
    });
    const monthlyEarnings = Number(
      monthlyVerifiedList.reduce((acc, curr) => acc + (curr.convertedAmount || 0), 0).toFixed(2)
    );

    // Compliance rate using academic compliance status
    const totalAcademic = await AcademicSnapshotModel.countDocuments();
    const compliantAcademic = await AcademicSnapshotModel.countDocuments({ complianceStatus: "COMPLIANT" });
    const complianceRate = totalAcademic > 0 ? Math.round((compliantAcademic / totalAcademic) * 100) : 0;

    // Completion rate using student average training progress
    const activeStudentsList = await StudentModel.find({ status: "ACTIVE" }).select("trainingProgress").lean();
    let completionRate = 0;
    if (activeStudentsList.length > 0) {
      const sumProgress = activeStudentsList.reduce((acc, s) => acc + (s.trainingProgress || 0), 0);
      completionRate = Math.round(sumProgress / activeStudentsList.length);
    }

    return {
      activeStudents,
      opportunityPipeline,
      monthlyEarnings,
      completionRate,
      totalBids,
      allocations,
      verifiedEarnings,
      complianceRate,
    };
  }

  return {
    ...mockDashboardMetrics,
    monthlyEarnings: 0,
    verifiedEarnings: 0,
  };
}

export async function getAnalyticsService(): Promise<AnalyticsSnapshot> {
  if (isDbConnected()) {
    // 1. Students grouped by tier
    const studentsByTierList = await StudentModel.aggregate([
      { $group: { _id: "$tier", count: { $sum: 1 } } },
    ]);

    const tierCounts: Record<string, number> = { TIER_1: 0, TIER_2: 0, TIER_3: 0, TIER_4: 0 };
    for (const item of studentsByTierList) {
      if (item._id && tierCounts[item._id] !== undefined) {
        tierCounts[item._id] = item.count;
      }
    }

    const studentsByTier = [
      { tier: "TIER_1" as const, count: tierCounts.TIER_1 },
      { tier: "TIER_2" as const, count: tierCounts.TIER_2 },
      { tier: "TIER_3" as const, count: tierCounts.TIER_3 },
      { tier: "TIER_4" as const, count: tierCounts.TIER_4 },
    ];

    // 2. Placement rate: distinct students with at least 1 allocation / active students
    const activeStudentCount = await StudentModel.countDocuments({ status: "ACTIVE" });
    const allocatedStudentIds = await AllocationModel.distinct("studentId");
    const placementRate = activeStudentCount > 0
      ? Math.round((allocatedStudentIds.length / activeStudentCount) * 100)
      : 0;

    // 3. Proposal win rate: approved proposals / submitted proposals
    const submittedProposalsCount = await ProposalModel.countDocuments({
      $or: [
        { status: { $in: ["IN_REVIEW", "APPROVED", "SUBMITTED"] } },
        { submittedAt: { $ne: null } },
      ],
    });
    const approvedProposalsCount = await ProposalModel.countDocuments({
      $or: [
        { status: "APPROVED" },
        { reviewStatus: "APPROVED" },
      ],
    });
    const proposalWinRate = submittedProposalsCount > 0
      ? Math.round((approvedProposalsCount / submittedProposalsCount) * 100)
      : 0;

    // 4. Average response hours: calculate from real bid -> allocation duration
    let averageResponseHours: number | null = null;
    const allocationsList = await AllocationModel.find().lean();
    let totalResponseTimeMs = 0;
    let validResponseCount = 0;

    for (const alloc of allocationsList) {
      if (alloc.allocatedAt) {
        const allocTime = new Date(alloc.allocatedAt).getTime();
        const matchingBid = await BidModel.findOne({
          opportunityId: alloc.opportunityId,
          studentId: alloc.studentId,
        }).lean();

        if (matchingBid && matchingBid.createdAt) {
          const bidTime = new Date(matchingBid.createdAt).getTime();
          const diffMs = allocTime - bidTime;
          if (diffMs >= 0) {
            totalResponseTimeMs += diffMs;
            validResponseCount++;
          }
        }
      }
    }

    if (validResponseCount > 0) {
      averageResponseHours = Number(((totalResponseTimeMs / validResponseCount) / (1000 * 60 * 60)).toFixed(1));
    }

    // 5. Learner satisfaction: null until genuine survey evaluation data exists
    const learnerSatisfaction: number | null = null;

    // 6. Weekly activity: actual actions created during the current Monday–Sunday week
    const weekDays = getCurrentWeekDays();
    const startDateStr = weekDays[0].dateStr;
    const endDateStr = weekDays[6].dateStr;

    const [bidsThisWeek, earningsThisWeek, allocationsThisWeek, proposalsThisWeek] = await Promise.all([
      BidModel.find().lean(),
      EarningsEntryModel.find().lean(),
      AllocationModel.find().lean(),
      ProposalModel.find().lean(),
    ]);

    const dayCounts: Record<string, number> = {};
    for (const d of weekDays) {
      dayCounts[d.dateStr] = 0;
    }

    const recordActivity = (dateVal: string | undefined | null) => {
      if (!dateVal) return;
      const dateStr = String(dateVal).split("T")[0];
      if (dateStr >= startDateStr && dateStr <= endDateStr && dayCounts[dateStr] !== undefined) {
        dayCounts[dateStr]++;
      }
    };

    for (const b of bidsThisWeek) recordActivity(b.createdAt);
    for (const e of earningsThisWeek) recordActivity(e.createdAt || e.earningDate);
    for (const a of allocationsThisWeek) recordActivity(a.allocatedAt);
    for (const p of proposalsThisWeek) recordActivity(p.submittedAt || p.createdAt);

    const weeklyActivity = weekDays.map((d) => ({
      label: d.label,
      date: d.dateStr,
      value: dayCounts[d.dateStr] || 0,
    }));

    return {
      placementRate,
      proposalWinRate,
      averageResponseHours,
      learnerSatisfaction,
      weeklyActivity,
      studentsByTier,
    };
  }

  return {
    ...mockAnalytics,
    averageResponseHours: null,
    learnerSatisfaction: null,
  };
}

export async function getProposalsService(): Promise<Proposal[]> {
  if (isDbConnected()) {
    const list = await ProposalModel.find().lean();
    return list.map((item) => stripMongoFields<Proposal>(item));
  }
  return mockProposals;
}

export async function createProposalService(input: Partial<Proposal>): Promise<Proposal> {
  const proposalId = input.id || `prop-${Date.now()}`;
  const newProposal: Proposal = {
    id: proposalId,
    title: input.title || "New Proposal",
    studentName: input.studentName || "Student Learner",
    opportunityId: input.opportunityId || "opp-1024",
    author: input.author || "Student",
    status: (input.status as any) || "DRAFT",
    reviewStatus: (input.reviewStatus as any) || "PENDING",
    version: input.version || 1,
    submittedAt: input.submittedAt || new Date().toISOString(),
    value: Number(input.value) || 0,
  };

  if (isDbConnected()) {
    const created = await ProposalModel.create(newProposal);
    return stripMongoFields<Proposal>(created.toObject());
  }

  mockProposals.unshift(newProposal);
  return newProposal;
}

export async function getSettingsService(): Promise<SettingsSummary> {
  if (isDbConnected()) {
    const s = await SettingsModel.findOne({ id: "default" }).lean();
    if (s) return stripMongoFields<SettingsSummary>(s);
  }
  return mockSettings;
}

/** Saves institution-wide settings (validated by the controller). Creates the record if it does not exist yet. */
export async function updateSettingsService(update: Partial<SettingsSummary>): Promise<SettingsSummary> {
  if (isDbConnected()) {
    const saved = await SettingsModel.findOneAndUpdate(
      { id: "default" },
      { $set: update, $setOnInsert: { id: "default" } },
      { new: true, upsert: true }
    ).lean();
    return stripMongoFields<SettingsSummary>(saved);
  }
  Object.assign(mockSettings, update);
  return mockSettings;
}

/**
 * Records a student's official CGPA. Eligibility follows the required CGPA (default 7.0), and the
 * student profile's CGPA field is kept in sync. Creates the academic record if it does not exist.
 */
export async function upsertAcademicRecordService(studentId: string, cgpa: number, requiredCgpa?: number): Promise<AcademicSnapshot> {
  if (isDbConnected()) {
    const student = await StudentModel.findOne({ id: studentId });
    if (!student) {
      const err: any = new Error("Student not found.");
      err.statusCode = 404;
      throw err;
    }
    const existing = await AcademicSnapshotModel.findOne({ studentId }).lean<AcademicSnapshot>();
    const required = requiredCgpa ?? existing?.requiredCgpa ?? 7;
    const saved = await AcademicSnapshotModel.findOneAndUpdate(
      { studentId },
      {
        $set: { cgpa, requiredCgpa: required, cgpaStatus: cgpa >= required ? "ELIGIBLE" : "RESTRICTED" },
        $setOnInsert: { studentId, complianceStatus: "COMPLIANT" },
      },
      { new: true, upsert: true }
    ).lean();
    student.cgpa = cgpa;
    await student.save();
    return stripMongoFields<AcademicSnapshot>(saved);
  }

  const student = mockStudents.find((s) => s.id === studentId);
  if (!student) {
    const err: any = new Error("Student not found.");
    err.statusCode = 404;
    throw err;
  }
  let record = mockAcademicSnapshots.find((a) => a.studentId === studentId);
  const required = requiredCgpa ?? record?.requiredCgpa ?? 7;
  if (!record) {
    record = { studentId, cgpa, requiredCgpa: required, cgpaStatus: "RESTRICTED", complianceStatus: "COMPLIANT" };
    mockAcademicSnapshots.push(record);
  }
  Object.assign(record, { cgpa, requiredCgpa: required, cgpaStatus: cgpa >= required ? "ELIGIBLE" : "RESTRICTED" });
  student.cgpa = cgpa;
  return record;
}

export async function getAcademicSnapshotService(studentId: string): Promise<AcademicSnapshot | null> {
  if (isDbConnected()) {
    const item = await AcademicSnapshotModel.findOne({ studentId }).lean();
    return item ? stripMongoFields<AcademicSnapshot>(item) : null;
  }
  return mockAcademicSnapshots.find((x) => x.studentId === studentId) ?? null;
}

function stripMongoFields<T>(obj: any): T {
  if (!obj) return obj as T;
  const { _id, __v, ...rest } = obj;
  return rest as T;
}
