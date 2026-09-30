import type { EarningsEntry, PlatformAccount } from "@edurev/types";
import {
  earnings as mockEarnings,
  platformAccounts as mockPlatformAccounts,
  verifyEarning as mockVerifyEarning,
} from "@edurev/mock-data";
import { isDbConnected } from "../config/db.js";
import { EarningsEntryModel, PlatformAccountModel, StudentModel } from "../models/index.js";

export async function getEarningsService(studentId?: string): Promise<EarningsEntry[]> {
  if (isDbConnected()) {
    const query = studentId ? { studentId } : {};
    const list = await EarningsEntryModel.find(query).lean();
    return list.map((item) => stripMongoFields<EarningsEntry>(item));
  }
  return studentId ? mockEarnings.filter((x) => x.studentId === studentId) : mockEarnings;
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
  status: "VERIFIED" | "REJECTED" = "VERIFIED"
): Promise<EarningsEntry> {
  if (isDbConnected()) {
    const earning = await EarningsEntryModel.findOne({ id });
    if (!earning) {
      const err: any = new Error("Earning not found.");
      err.statusCode = 404;
      throw err;
    }

    earning.verificationStatus = status;
    earning.verifiedBy = verifiedBy;
    earning.verifiedAt = new Date().toISOString();
    await earning.save();

    if (status === "VERIFIED") {
      const student = await StudentModel.findOne({ id: earning.studentId });
      if (student) {
        student.earnings = (student.earnings || 0) + earning.convertedAmount;
        await student.save();
      }
    }

    return stripMongoFields<EarningsEntry>(earning.toObject());
  }

  return mockVerifyEarning(id, verifiedBy, status);
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
