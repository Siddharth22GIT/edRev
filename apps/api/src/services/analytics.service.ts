import type { AcademicSnapshot, AnalyticsSnapshot, DashboardMetrics, Proposal, SettingsSummary } from "@edurev/types";
import {
  academicSnapshots as mockAcademicSnapshots,
  analytics as mockAnalytics,
  dashboardMetrics as mockDashboardMetrics,
  proposals as mockProposals,
  settings as mockSettings,
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

export async function getDashboardMetricsService(): Promise<DashboardMetrics> {
  if (isDbConnected()) {
    const activeStudents = await StudentModel.countDocuments({ status: "ACTIVE" });
    const opportunityPipeline = await OpportunityModel.countDocuments({ status: { $in: ["OPEN", "UNDER_REVIEW"] } });
    const verifiedEarningsList = await EarningsEntryModel.find({ verificationStatus: "VERIFIED" }).lean();
    const verifiedEarnings = verifiedEarningsList.reduce((acc, curr) => acc + (curr.convertedAmount || 0), 0);
    const totalBids = await BidModel.countDocuments();
    const allocations = await AllocationModel.countDocuments();

    return {
      activeStudents,
      opportunityPipeline,
      monthlyEarnings: verifiedEarnings || mockDashboardMetrics.monthlyEarnings,
      completionRate: mockDashboardMetrics.completionRate,
      totalBids,
      allocations,
      verifiedEarnings,
      complianceRate: mockDashboardMetrics.complianceRate,
    };
  }

  return mockDashboardMetrics;
}

export async function getAnalyticsService(): Promise<AnalyticsSnapshot> {
  if (isDbConnected()) {
    const studentsByTierList = await StudentModel.aggregate([
      { $group: { _id: "$tier", count: { $sum: 1 } } },
    ]);

    const tierCounts: Record<string, number> = { TIER_1: 0, TIER_2: 0, TIER_3: 0, TIER_4: 0 };
    for (const item of studentsByTierList) {
      if (item._id) tierCounts[item._id] = item.count;
    }

    return {
      ...mockAnalytics,
      studentsByTier: [
        { tier: "TIER_1", count: tierCounts.TIER_1 },
        { tier: "TIER_2", count: tierCounts.TIER_2 },
        { tier: "TIER_3", count: tierCounts.TIER_3 },
        { tier: "TIER_4", count: tierCounts.TIER_4 },
      ],
    };
  }

  return mockAnalytics;
}

export async function getProposalsService(): Promise<Proposal[]> {
  if (isDbConnected()) {
    const list = await ProposalModel.find().lean();
    return list.map((item) => stripMongoFields<Proposal>(item));
  }
  return mockProposals;
}

export async function getSettingsService(): Promise<SettingsSummary> {
  if (isDbConnected()) {
    const s = await SettingsModel.findOne({ id: "default" }).lean();
    if (s) return stripMongoFields<SettingsSummary>(s);
  }
  return mockSettings;
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
