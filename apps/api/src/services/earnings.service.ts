import type { EarningsEntry, EarningsSummary, PlatformAccount } from "@edurev/types";
import {
  earnings as mockEarnings,
  platformAccounts as mockPlatformAccounts,
  students as mockStudents,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { EarningsEntryModel, PlatformAccountModel, StudentModel } from "../models/index.js";

export async function getEarningsService(studentId?: string): Promise<EarningsEntry[]> {
  if (isDbConnected()) {
    const query = studentId ? { studentId } : {};
    const list = await EarningsEntryModel.find(query).lean();
    return list.map((item) => stripMongoFields<EarningsEntry>(item));
  }
  return studentId ? mockEarnings.filter((x) => x.studentId === studentId) : [...mockEarnings];
}

export interface CreateEarningInput {
  studentId: string;
  platformName: string;
  originalAmount: number;
  originalCurrency: string;
  exchangeRate: number;
  evidence: string;
}

export async function submitEarningService(input: CreateEarningInput): Promise<EarningsEntry> {
  const convertedAmount = Number((input.originalAmount * input.exchangeRate).toFixed(2));
  const newEarning: EarningsEntry = {
    id: `earn-${Date.now()}`,
    studentId: input.studentId,
    platformName: input.platformName,
    originalAmount: input.originalAmount,
    originalCurrency: input.originalCurrency,
    exchangeRate: input.exchangeRate,
    convertedAmount,
    convertedCurrency: "INR",
    earningDate: new Date().toISOString().split("T")[0],
    verificationStatus: "PENDING",
    evidence: input.evidence,
    evidenceStatus: "AVAILABLE",
    createdAt: new Date().toISOString(),
  };

  if (isDbConnected()) {
    const created = await EarningsEntryModel.create(newEarning);
    return stripMongoFields<EarningsEntry>(created.toObject());
  }

  mockEarnings.push(newEarning);
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
