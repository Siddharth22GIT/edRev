import type { EarningsEntry, PlatformAccount } from "@edurev/types";
import {
  earnings as mockEarnings,
  platformAccounts as mockPlatformAccounts,
  verifyEarning as mockVerifyEarning,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { EarningsEntryModel, PlatformAccountModel, StudentModel } from "../models/index.js";

const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 83.2,
  EUR: 91.5,
  GBP: 108.0,
  INR: 1.0,
};

export async function getEarningsService(studentId?: string): Promise<EarningsEntry[]> {
  if (isDbConnected()) {
    const query = studentId ? { studentId } : {};
    const list = await EarningsEntryModel.find(query).sort({ createdAt: -1 }).lean();
    return list.map((item) => stripMongoFields<EarningsEntry>(item));
  }
  return studentId ? mockEarnings.filter((x) => x.studentId === studentId) : mockEarnings;
}

export interface StudentEarningsSummary {
  studentId: string;
  totalVerified: number;
  totalPending: number;
  totalRejected: number;
  entries: EarningsEntry[];
}

export async function getStudentEarningsSummaryService(studentId: string): Promise<StudentEarningsSummary> {
  const entries = await getEarningsService(studentId);

  let totalVerified = 0;
  let totalPending = 0;
  let totalRejected = 0;

  for (const item of entries) {
    if (item.verificationStatus === "VERIFIED") {
      totalVerified += item.convertedAmount;
    } else if (item.verificationStatus === "PENDING") {
      totalPending += item.convertedAmount;
    } else if (item.verificationStatus === "REJECTED") {
      totalRejected += item.convertedAmount;
    }
  }

  return {
    studentId,
    totalVerified: Number(totalVerified.toFixed(2)),
    totalPending: Number(totalPending.toFixed(2)),
    totalRejected: Number(totalRejected.toFixed(2)),
    entries,
  };
}

export interface CreateEarningInput {
  studentId: string;
  platformName: string;
  projectTitle?: string;
  originalAmount: number;
  originalCurrency: string;
  exchangeRate?: number;
  earningDate?: string;
  evidence?: string;
  screenshotUrl?: string;
}

export async function submitEarningService(input: CreateEarningInput): Promise<EarningsEntry> {
  const currency = (input.originalCurrency || "USD").toUpperCase();
  const rate = input.exchangeRate || DEFAULT_EXCHANGE_RATES[currency] || 83.2;
  const earningDate = input.earningDate || new Date().toISOString().split("T")[0];
  const convertedAmount = Number((input.originalAmount * rate).toFixed(2));

  // Server-side duplicate checking (studentId + platformName + originalAmount + earningDate)
  if (isDbConnected()) {
    const existing = await EarningsEntryModel.findOne({
      studentId: input.studentId,
      platformName: input.platformName,
      originalAmount: input.originalAmount,
      earningDate,
    });
    if (existing) {
      const err: any = new Error("Duplicate earning submission detected for this platform, date, and amount.");
      err.statusCode = 409;
      throw err;
    }
  } else {
    const dup = mockEarnings.find(
      (x) =>
        x.studentId === input.studentId &&
        x.platformName === input.platformName &&
        x.originalAmount === input.originalAmount &&
        x.earningDate === earningDate
    );
    if (dup) {
      const err: any = new Error("Duplicate earning submission detected.");
      err.statusCode = 409;
      throw err;
    }
  }

  const newEarning: EarningsEntry = {
    id: `earn-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    studentId: input.studentId,
    platformName: input.platformName,
    projectTitle: input.projectTitle || `${input.platformName} Freelance Project`,
    originalAmount: input.originalAmount,
    originalCurrency: currency,
    exchangeRate: rate,
    convertedAmount,
    convertedCurrency: "INR",
    earningDate,
    verificationStatus: "PENDING", // MUST always be initial PENDING state
    evidence: input.evidence || "Proof statement uploaded",
    screenshotUrl: input.screenshotUrl,
    evidenceStatus: "AVAILABLE",
    createdAt: new Date().toISOString(),
  };

  if (isDbConnected()) {
    const created = await EarningsEntryModel.create(newEarning);
    return stripMongoFields<EarningsEntry>(created.toObject());
  }

  mockEarnings.unshift(newEarning);
  return newEarning;
}

export async function verifyEarningService(
  id: string,
  verifiedBy: string = "FACULTY_DIRECTOR",
  status: "VERIFIED" | "REJECTED" = "VERIFIED",
  rejectionReason?: string
): Promise<EarningsEntry> {
  if (isDbConnected()) {
    const earning = await EarningsEntryModel.findOne({ id });
    if (!earning) {
      const err: any = new Error("Earning record not found.");
      err.statusCode = 404;
      throw err;
    }

    earning.verificationStatus = status;
    earning.verifiedBy = verifiedBy;
    earning.verifiedAt = new Date().toISOString();
    if (status === "REJECTED") {
      earning.rejectionReason = rejectionReason || "Evidence unverified or incomplete.";
    }

    await earning.save();

    // Recalculate student total verified earnings on StudentModel
    const student = await StudentModel.findOne({ id: earning.studentId });
    if (student) {
      const allVerified = await EarningsEntryModel.find({
        studentId: earning.studentId,
        verificationStatus: "VERIFIED",
      }).lean();
      const verifiedTotal = allVerified.reduce((acc: number, curr: any) => acc + (curr.convertedAmount || 0), 0);
      student.earnings = Number(verifiedTotal.toFixed(2));
      await student.save();
    }

    return stripMongoFields<EarningsEntry>(earning.toObject());
  }

  const res = mockVerifyEarning(id, verifiedBy, status);
  if (status === "REJECTED") {
    res.rejectionReason = rejectionReason || "Evidence unverified.";
  }
  return res;
}

export async function getPlatformAccountsService(): Promise<PlatformAccount[]> {
  if (isDbConnected()) {
    const list = await PlatformAccountModel.find().lean();
    return list.map((item) => stripMongoFields<PlatformAccount>(item));
  }
  return mockPlatformAccounts;
}

function stripMongoFields<T>(obj: any): T {
  if (!obj) return obj as T;
  const { _id, __v, ...rest } = obj;
  return rest as T;
}
