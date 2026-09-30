import bcrypt from "bcryptjs";
import {
  academicSnapshots,
  allocations,
  bids,
  blackouts,
  earnings,
  hourLogs,
  opportunities,
  platformAccounts,
  proposals,
  safeguards,
  settings,
  students,
  trainingModules,
} from "@edurev/mock-data";
import type { Role } from "@edurev/types";
import {
  AcademicSnapshotModel,
  AllocationModel,
  BidModel,
  BlackoutPeriodModel,
  EarningsEntryModel,
  HourLogModel,
  OpportunityModel,
  PlatformAccountModel,
  ProposalModel,
  SafeguardModel,
  SettingsModel,
  StudentModel,
  TrainingModuleModel,
  UserModel,
} from "../models/index.js";

export const DEV_DEFAULT_PASSWORD = "Password123!";

export const seedUsersList: Array<{
  id: string;
  name: string;
  email: string;
  role: Role;
  studentId?: string;
}> = [
  {
    id: "usr-student",
    name: "Rohan Patel",
    email: "student@revalanche.local",
    role: "STUDENT",
    studentId: "stu-202",
  },
  {
    id: "usr-analyst",
    name: "Elena Martin",
    email: "analyst@revalanche.local",
    role: "BID_DESK_ANALYST",
  },
  {
    id: "usr-editor",
    name: "Priya Sharma",
    email: "editor@revalanche.local",
    role: "PROPOSAL_EDITOR",
  },
  {
    id: "usr-guild",
    name: "Vikram Malhotra",
    email: "guild@revalanche.local",
    role: "GUILD_LEAD",
  },
  {
    id: "usr-coordinator",
    name: "Ananya Roy",
    email: "coordinator@revalanche.local",
    role: "CELL_COORDINATOR",
  },
  {
    id: "usr-faculty",
    name: "Dr. Sarah Jenkins",
    email: "faculty@revalanche.local",
    role: "FACULTY_DIRECTOR",
  },
  {
    id: "usr-placement",
    name: "Placement Office",
    email: "placement@revalanche.local",
    role: "PLACEMENT_OFFICE",
  },
  {
    id: "usr-dean",
    name: "Dean Office",
    email: "dean@revalanche.local",
    role: "DEAN",
  },
  {
    id: "usr-admin",
    name: "System Administrator",
    email: "admin@revalanche.local",
    role: "ADMINISTRATOR",
  },
];

export async function seedDatabaseIfEmpty(): Promise<void> {
  try {
    // Seed users idempotently (insert missing users if any)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(DEV_DEFAULT_PASSWORD, salt);

    for (const u of seedUsersList) {
      const exists = await UserModel.findOne({ email: u.email });
      if (!exists) {
        await UserModel.create({
          ...u,
          passwordHash,
        });
        console.log(`🔑 Seeded development user: ${u.email} (${u.role})`);
      }
    }

    const studentCount = await StudentModel.countDocuments();
    if (studentCount > 0) {
      console.log("ℹ️ MongoDB entity collections already contain data. Skipping entity seeding.");
      return;
    }

    console.log("🌱 Seeding MongoDB with initial EduRev dataset...");

    await StudentModel.insertMany(students);
    await OpportunityModel.insertMany(opportunities);
    await BidModel.insertMany(bids);
    if (allocations.length > 0) {
      await AllocationModel.insertMany(allocations);
    }

    const validEarnings = earnings.filter((e) => e && e.id);
    if (validEarnings.length > 0) {
      await EarningsEntryModel.insertMany(validEarnings);
    }

    await PlatformAccountModel.insertMany(platformAccounts);
    await AcademicSnapshotModel.insertMany(academicSnapshots);
    await HourLogModel.insertMany(hourLogs);
    await BlackoutPeriodModel.insertMany(blackouts);
    await SafeguardModel.insertMany(safeguards);
    await ProposalModel.insertMany(proposals);
    await SettingsModel.create(settings);

    const trainingDocs: Array<{ id: string; studentId: string; title: string; description: string; status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED"; completionPercentage: number }> = [];
    for (const [studentId, modules] of Object.entries(trainingModules)) {
      for (const m of modules) {
        trainingDocs.push({
          ...m,
          studentId,
        });
      }
    }
    if (trainingDocs.length > 0) {
      await TrainingModuleModel.insertMany(trainingDocs);
    }

    await BidModel.syncIndexes();

    console.log("✅ MongoDB successfully seeded!");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
  }
}
