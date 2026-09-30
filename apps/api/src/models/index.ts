import mongoose, { Schema } from "mongoose";
import type {
  AcademicSnapshot,
  Allocation,
  Bid,
  BlackoutPeriod,
  EarningsEntry,
  HourLog,
  Opportunity,
  PlatformAccount,
  Proposal,
  Safeguard,
  SettingsSummary,
  Student,
  TrainingModule,
  User,
} from "@edurev/types";


// 1. Student Model
const studentSchema = new Schema<Student>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    avatarInitials: { type: String, required: true },
    program: { type: String, required: true },
    course: { type: String, required: true },
    year: { type: Number, required: true },
    tier: { type: String, enum: ["TIER_1", "TIER_2", "TIER_3", "TIER_4"], required: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], required: true },
    skills: [{ type: String }],
    trainingProgress: { type: Number, required: true },
    progress: { type: Number, required: true },
    cgpa: { type: Number, required: true },
    joinedAt: { type: String, required: true },
    projectsCompleted: { type: Number, required: true },
    earnings: { type: Number, required: true },
    mentor: { type: String, required: true },
  },
  { timestamps: true }
);

// 2. Opportunity Model
const opportunitySchema = new Schema<Opportunity>(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    project: { type: String, required: true },
    description: { type: String, required: true },
    client: { type: String, required: true },
    company: { type: String, required: true },
    category: { type: String, required: true },
    skills: [{ type: String }],
    budget: { type: Number, required: true },
    currency: { type: String, required: true },
    deadline: { type: String, required: true },
    status: { type: String, enum: ["OPEN", "UNDER_REVIEW", "ALLOCATED", "CLOSED"], required: true },
    requiredTier: { type: String, enum: ["TIER_1", "TIER_2", "TIER_3", "TIER_4"], required: true },
    estimatedHours: { type: Number, required: true },
    numberOfBids: { type: Number, default: 0 },
    slaDeadline: { type: String, required: true },
    matchScore: { type: Number, required: true },
    deliverables: [{ type: String }],
    updatedAt: { type: String, required: true },
    allocatedStudentId: { type: String },
  },
  { timestamps: true }
);

// 3. Bid Model with DATABASE-LEVEL UNIQUE CONSTRAINT
const bidSchema = new Schema<Bid>(
  {
    id: { type: String, required: true, unique: true },
    opportunityId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    proposedAmount: { type: Number, required: true },
    estimatedCompletionTime: { type: String, required: true },
    message: { type: String, required: true },
    relevantSkills: { type: String, required: true },
    status: { type: String, enum: ["SUBMITTED", "SHORTLISTED", "REJECTED", "ALLOCATED", "WITHDRAWN"], default: "SUBMITTED" },

    createdAt: { type: String, required: true },
  },
  { timestamps: true }
);

// Database-level enforcement: one bid per student per opportunity
bidSchema.index({ opportunityId: 1, studentId: 1 }, { unique: true });

// 4. Allocation Model with SLA Tracking
export interface AllocationDocument extends Allocation {
  id?: string;
  slaStartAt?: string;
  slaDeadline?: string;
  slaStatus?: "ACTIVE" | "AT_RISK" | "COMPLETED" | "OVERDUE" | "CANCELLED";
}

const allocationSchema = new Schema<AllocationDocument>(
  {
    opportunityId: { type: String, required: true, unique: true },
    studentId: { type: String, required: true },
    allocatedBy: { type: String, required: true },
    allocatedAt: { type: String, required: true },
    status: { type: String, enum: ["ALLOCATED", "ACTIVE", "AT_RISK", "COMPLETED", "OVERDUE", "CANCELLED"], default: "ALLOCATED" },
    slaStartAt: { type: String },
    slaDeadline: { type: String },
    slaStatus: { type: String, enum: ["ACTIVE", "AT_RISK", "COMPLETED", "OVERDUE", "CANCELLED"], default: "ACTIVE" },
  },
  { timestamps: true }
);

// 5. EarningsEntry Model
const earningsEntrySchema = new Schema<EarningsEntry>(
  {
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true, index: true },
    platformName: { type: String, required: true },
    originalAmount: { type: Number, required: true },
    originalCurrency: { type: String, required: true },
    exchangeRate: { type: Number, required: true },
    convertedAmount: { type: Number, required: true },
    convertedCurrency: { type: String, required: true },
    earningDate: { type: String, required: true },
    verificationStatus: { type: String, enum: ["PENDING", "VERIFIED", "REJECTED"], default: "PENDING" },
    evidence: { type: String, required: true },
    evidenceStatus: { type: String, enum: ["AVAILABLE", "MISSING"], default: "AVAILABLE" },
    createdAt: { type: String, required: true },
    verifiedBy: { type: String },
    verifiedAt: { type: String },
  },
  { timestamps: true }
);

// 6. PlatformAccount Model
const platformAccountSchema = new Schema<PlatformAccount>(
  {
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true, index: true },
    platform: { type: String, required: true },
    accountIdentifier: { type: String, required: true },
    accountStatus: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    verificationStatus: { type: String, enum: ["PENDING", "VERIFIED", "REJECTED"], default: "VERIFIED" },
  },
  { timestamps: true }
);

// 7. TrainingModule Model
export interface TrainingModuleDocument extends TrainingModule {
  studentId: string;
}

const trainingModuleSchema = new Schema<TrainingModuleDocument>(
  {
    id: { type: String, required: true },
    studentId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ["COMPLETED", "IN_PROGRESS", "NOT_STARTED"], required: true },
    completionPercentage: { type: Number, required: true },
  },
  { timestamps: true }
);

// 8. AcademicSnapshot Model
const academicSnapshotSchema = new Schema<AcademicSnapshot>(
  {
    studentId: { type: String, required: true, unique: true },
    cgpa: { type: Number, required: true },
    requiredCgpa: { type: Number, required: true },
    cgpaStatus: { type: String, enum: ["ELIGIBLE", "RESTRICTED"], required: true },
    complianceStatus: { type: String, enum: ["COMPLIANT", "WARNING", "NON_COMPLIANT"], required: true },
  },
  { timestamps: true }
);

// 9. HourLog Model
const hourLogSchema = new Schema<HourLog>(
  {
    studentId: { type: String, required: true, unique: true },
    period: { type: String, required: true },
    allowedHours: { type: Number, required: true },
    loggedHours: { type: Number, required: true },
    remainingHours: { type: Number, required: true },
    status: { type: String, enum: ["NORMAL", "WARNING", "BLOCKED"], required: true },
    overridden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// 10. BlackoutPeriod Model
const blackoutPeriodSchema = new Schema<BlackoutPeriod>(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
  },
  { timestamps: true }
);

// 11. Proposal Model
const proposalSchema = new Schema<Proposal>(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    studentName: { type: String, required: true },
    opportunityId: { type: String, required: true },
    author: { type: String, required: true },
    status: { type: String, enum: ["DRAFT", "IN_REVIEW", "APPROVED", "SUBMITTED"], required: true },
    reviewStatus: { type: String, enum: ["PENDING", "APPROVED"], required: true },
    version: { type: Number, required: true },
    submittedAt: { type: String, default: null },
    value: { type: Number, required: true },
  },
  { timestamps: true }
);

// 12. Safeguard Model
const safeguardSchema = new Schema<Safeguard>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ["healthy", "attention", "blocked"], required: true },
    owner: { type: String, required: true },
    lastCheckedAt: { type: String, required: true },
  },
  { timestamps: true }
);

// 13. Settings Model
export interface SettingsDocument extends SettingsSummary {
  id: string;
}

const settingsSchema = new Schema<SettingsDocument>(
  {
    id: { type: String, required: true, default: "default", unique: true },
    organizationName: { type: String, required: true },
    notificationEmail: { type: String, required: true },
    weeklyDigestEnabled: { type: Boolean, required: true },
    timezone: { type: String, required: true },
  },
  { timestamps: true }
);

// 14. User Model
const userSchema = new Schema<User>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["STUDENT", "BID_DESK_ANALYST", "PROPOSAL_EDITOR", "GUILD_LEAD", "CELL_COORDINATOR", "FACULTY_DIRECTOR", "PLACEMENT_OFFICE", "DEAN", "ADMINISTRATOR"],
      required: true,
    },
    studentId: { type: String },
  },
  { timestamps: true }
);

export const StudentModel = mongoose.models.Student || mongoose.model<Student>("Student", studentSchema);
export const OpportunityModel = mongoose.models.Opportunity || mongoose.model<Opportunity>("Opportunity", opportunitySchema);
export const BidModel = mongoose.models.Bid || mongoose.model<Bid>("Bid", bidSchema);
export const AllocationModel = mongoose.models.Allocation || mongoose.model<AllocationDocument>("Allocation", allocationSchema);
export const EarningsEntryModel = mongoose.models.EarningsEntry || mongoose.model<EarningsEntry>("EarningsEntry", earningsEntrySchema);
export const PlatformAccountModel = mongoose.models.PlatformAccount || mongoose.model<PlatformAccount>("PlatformAccount", platformAccountSchema);
export const TrainingModuleModel = mongoose.models.TrainingModule || mongoose.model<TrainingModuleDocument>("TrainingModule", trainingModuleSchema);
export const AcademicSnapshotModel = mongoose.models.AcademicSnapshot || mongoose.model<AcademicSnapshot>("AcademicSnapshot", academicSnapshotSchema);
export const HourLogModel = mongoose.models.HourLog || mongoose.model<HourLog>("HourLog", hourLogSchema);
export const BlackoutPeriodModel = mongoose.models.BlackoutPeriod || mongoose.model<BlackoutPeriod>("BlackoutPeriod", blackoutPeriodSchema);
export const ProposalModel = mongoose.models.Proposal || mongoose.model<Proposal>("Proposal", proposalSchema);
export const SafeguardModel = mongoose.models.Safeguard || mongoose.model<Safeguard>("Safeguard", safeguardSchema);
export const SettingsModel = mongoose.models.Settings || mongoose.model<SettingsDocument>("Settings", settingsSchema);
export const UserModel = mongoose.models.User || mongoose.model<User>("User", userSchema);

