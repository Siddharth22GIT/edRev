import type { EarningsEntry, EarningsSummary, PlatformAccount } from "@edurev/types";
import {
  earnings as mockEarnings,
  platformAccounts as mockPlatformAccounts,
  students as mockStudents,
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
  return studentId ? mockEarnings.filter((x) => x.studentId === studentId) : [...mockEarnings];
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

    if (earning.verificationStatus === "VERIFIED") {
      const err: any = new Error("Earning has already been verified.");
      err.statusCode = 400;
      throw err;
    }

    if (earning.verificationStatus === "REJECTED") {
      const err: any = new Error("Earning has already been rejected.");
      err.statusCode = 400;
      throw err;
    }

    if (earning.verificationStatus !== "PENDING") {
      const err: any = new Error(`Earning has already been ${earning.verificationStatus.toLowerCase()}.`);
      err.statusCode = 400;
      throw err;
    }

    earning.verificationStatus = status;
    earning.verifiedBy = verifiedBy;
    earning.verifiedAt = new Date().toISOString();
    if (status === "REJECTED") {
      earning.rejectionReason = rejectionReason || "No rejection reason provided";
    } else {
      earning.rejectionReason = undefined;
    }
    await earning.save();

    if (status === "VERIFIED") {
      const student = await StudentModel.findOne({ id: earning.studentId });
      if (student) {
        // Calculate true total verified earnings from all verified entries to prevent double-counting
        const allVerified = await EarningsEntryModel.find({
          studentId: earning.studentId,
          verificationStatus: "VERIFIED",
        }).lean();
        const verifiedTotal = allVerified.reduce((sum, item) => sum + (item.convertedAmount || 0), 0);
        student.earnings = verifiedTotal;
        await student.save();
      }
    }

    return stripMongoFields<EarningsEntry>(earning.toObject());
  }

  const earning = mockEarnings.find((x) => x.id === id);
  if (!earning) {
    const err: any = new Error("Earning not found.");
    err.statusCode = 404;
    throw err;
  }

  if (earning.verificationStatus === "VERIFIED") {
    const err: any = new Error("Earning has already been verified.");
    err.statusCode = 400;
    throw err;
  }

  if (earning.verificationStatus === "REJECTED") {
    const err: any = new Error("Earning has already been rejected.");
    err.statusCode = 400;
    throw err;
  }

  earning.verificationStatus = status;
  earning.verifiedBy = verifiedBy;
  earning.verifiedAt = new Date().toISOString();
  if (status === "REJECTED") {
    earning.rejectionReason = rejectionReason || "No rejection reason provided";
  } else {
    earning.rejectionReason = undefined;
    const student = mockStudents.find((s) => s.id === earning.studentId);
    if (student) {
      const verifiedTotal = mockEarnings
        .filter((e) => e.studentId === earning.studentId && e.verificationStatus === "VERIFIED")
        .reduce((sum, e) => sum + (e.convertedAmount || 0), 0);
      student.earnings = verifiedTotal;
    }
  }

  return earning;
}

export async function getEarningsSummaryService(studentId?: string): Promise<EarningsSummary> {
  const list = await getEarningsService(studentId);
  let totalSubmitted = 0;
  let totalVerified = 0;
  let totalPending = 0;
  let totalRejected = 0;
  let verifiedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;

  for (const item of list) {
    const amt = item.convertedAmount || 0;
    totalSubmitted += amt;
    if (item.verificationStatus === "VERIFIED") {
      totalVerified += amt;
      verifiedCount++;
    } else if (item.verificationStatus === "REJECTED") {
      totalRejected += amt;
      rejectedCount++;
    } else {
      totalPending += amt;
      pendingCount++;
    }
  }

  return {
    studentId,
    totalSubmitted: Number(totalSubmitted.toFixed(2)),
    totalVerified: Number(totalVerified.toFixed(2)),
    totalPending: Number(totalPending.toFixed(2)),
    totalRejected: Number(totalRejected.toFixed(2)),
    count: list.length,
    verifiedCount,
    pendingCount,
    rejectedCount,
    currency: "INR",
  };
}

export async function getPlatformAccountsService(studentId?: string): Promise<PlatformAccount[]> {
  if (isDbConnected()) {
    const query = studentId ? { studentId } : {};
    const list = await PlatformAccountModel.find(query).lean();
    return list.map((item) => stripMongoFields<PlatformAccount>(item));
  }
  return studentId ? mockPlatformAccounts.filter((x) => x.studentId === studentId) : [...mockPlatformAccounts];
}

function stripMongoFields<T>(obj: any): T {
  if (!obj) return obj as T;
  const { _id, __v, ...rest } = obj;
  return rest as T;
}
