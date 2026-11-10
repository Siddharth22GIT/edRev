import mongoose, { Schema } from "mongoose";
import type {
  HelpRequest,
  HourEntry,
  SafeguardOverride,
  SlaEvent,
  WeeklyCheckin,
  AcademicSnapshot,
  Allocation,
  Bid,
  BlackoutPeriod,
  ChatMessage,
  Conversation,
  EarningsEntry,
  HourLog,
  Opportunity,
  PlatformAccount,
  Proposal,
  Safeguard,
  SettingsSummary,
  Student,
  TierSuggestion,
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
    // Set for students who joined through self sign-up (unique when present)
    registrationNumber: { type: String, unique: true, sparse: true },
    // Optional self-managed profile fields
    photoUrl: { type: String },
    bio: { type: String },
    phone: { type: String },
    location: { type: String },
    // First-login onboarding answers (claimedCgpa is self-reported and never replaces the official CGPA)
    onboardingCompletedAt: { type: String },
    onboardingSkippedAt: { type: String },
    claimedCgpa: { type: Number },
    interests: [{ type: String }],
    goals: { type: String },
    availabilityHours: { type: Number },
    portfolioLinks: [{ label: { type: String }, url: { type: String }, _id: false }],
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
    // E2: optional moment bidding closes
    bidsCloseAt: { type: String },
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
    proposalPdfUrl: { type: String },
    proposalPdfName: { type: String },
    createdAt: { type: String, required: true },
    // E5: student edits and withdrawals
    editedAt: { type: String },
    withdrawnAt: { type: String },
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
    // Delivery confirmation (evidence for the top tier)
    deliveredAt: { type: String },
    deliveryConfirmedBy: { type: String },
    onTime: { type: Boolean },
    // E1b / D7: reassignment history and direct assignments
    reassignments: [
      {
        _id: false,
        fromStudentId: { type: String, required: true },
        toStudentId: { type: String, required: true },
        by: { type: String, required: true },
        at: { type: String, required: true },
        reason: { type: String, required: true },
      },
    ],
    directAssignmentReason: { type: String },
    // Phase 4 (F2, G10): milestones, submissions, extensions, pauses, cancellation, hand-back. All optional.
    milestones: [{ _id: false, id: { type: String, required: true }, title: { type: String, required: true }, doneAt: { type: String } }],
    kickoffAt: { type: String },
    submissions: [
      {
        _id: false,
        id: { type: String, required: true },
        round: { type: Number, required: true },
        link: { type: String },
        fileName: { type: String },
        fileUrl: { type: String },
        note: { type: String },
        submittedAt: { type: String, required: true },
        decision: { type: String, enum: ["ACCEPTED", "REVISION_REQUESTED"] },
        decidedBy: { type: String },
        decidedAt: { type: String },
        feedback: { type: String },
      },
    ],
    extensions: [
      {
        _id: false,
        id: { type: String, required: true },
        days: { type: Number, required: true },
        reason: { type: String, required: true },
        requestedAt: { type: String, required: true },
        status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], required: true },
        decidedBy: { type: String },
        decidedAt: { type: String },
        note: { type: String },
        newDeadline: { type: String },
      },
    ],
    pauses: [{ _id: false, from: { type: String, required: true }, to: { type: String }, reason: { type: String, required: true }, by: { type: String, required: true } }],
    originalSlaDeadline: { type: String },
    cancelledAt: { type: String },
    cancelledBy: { type: String },
    cancelReason: { type: String },
    handBack: { _id: false, requestedAt: { type: String }, reason: { type: String } },
    lastHoursAt: { type: String },
  },
  { timestamps: true }
);

// 5. EarningsEntry Model
const earningsEntrySchema = new Schema<EarningsEntry>(
  {
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true, index: true },
    platformName: { type: String, required: true },
    projectTitle: { type: String },
    originalAmount: { type: Number, required: true },
    originalCurrency: { type: String, required: true },
    exchangeRate: { type: Number, required: true },
    convertedAmount: { type: Number, required: true },
    convertedCurrency: { type: String, required: true },
    earningDate: { type: String, required: true },
    verificationStatus: { type: String, enum: ["PENDING", "VERIFIED", "REJECTED"], default: "PENDING" },
    evidence: { type: String, required: true },
    screenshotUrl: { type: String },
    evidenceStatus: { type: String, enum: ["AVAILABLE", "MISSING"], default: "AVAILABLE" },
    createdAt: { type: String, required: true },
    verifiedBy: { type: String },
    verifiedAt: { type: String },
    rejectionReason: { type: String },
  },
  { timestamps: true }
);

// E6: the same earning (student + platform + amount + date) can only be recorded once, even on a double-click
earningsEntrySchema.index({ studentId: 1, platformName: 1, originalAmount: 1, earningDate: 1 }, { unique: true });

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
    // G3: recorded by a Faculty Director. Unset = not recorded (never counted as a pass).
    attendancePercent: { type: Number },
    activeBacklogs: { type: Number },
    complianceNote: { type: String },
    cgpaRecordedAt: { type: String },
    complianceUpdatedBy: { type: String },
    complianceUpdatedAt: { type: String },
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
    overrideReason: { type: String },
    overriddenBy: { type: String },
    overriddenAt: { type: String },
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
    // G4: limit a blackout to some programmes / years (empty = everyone)
    programs: [{ type: String }],
    years: [{ type: Number }],
    createdBy: { type: String },
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
    signupEnabled: { type: Boolean },
    allowedSignupDomains: [{ type: String }],
    // G1: safeguard limits edited by an Administrator (validated in the service)
    safeguardLimits: { type: Schema.Types.Mixed },
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
    // S5: part of every login token; increasing it ends all existing sessions. Hidden from normal reads.
    tokenVersion: { type: Number, select: false },
    // Self sign-up. Accounts without a status (all pre-existing ones) are treated as ACTIVE.
    status: { type: String, enum: ["ACTIVE", "PENDING_APPROVAL", "REJECTED"] },
    signup: {
      registrationNumber: { type: String },
      program: { type: String },
      course: { type: String },
      year: { type: Number },
      requestedAt: { type: String },
      attempts: { type: Number },
      decidedBy: { type: String },
      decidedAt: { type: String },
      rejectionReason: { type: String },
    },
    preferences: {
      celebrations: { type: Boolean },
      reduceMotion: { type: Boolean },
      showBadges: { type: Boolean },
      navCollapsed: { type: Boolean }, // U3: optional; absent = expanded
    },
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
// Tier suggestions: recommendations for an administrator to approve or dismiss
const tierSuggestionSchema = new Schema<TierSuggestion>(
  {
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, required: true },
    currentTier: { type: String, enum: ["TIER_1", "TIER_2", "TIER_3", "TIER_4"], required: true },
    suggestedTier: { type: String, enum: ["TIER_1", "TIER_2", "TIER_3", "TIER_4"], required: true },
    reasons: [{ type: String }],
    notes: [{ type: String }],
    status: { type: String, enum: ["PENDING", "APPROVED", "DISMISSED"], default: "PENDING", index: true },
    createdAt: { type: String, required: true },
    decidedBy: { type: String },
    decidedAt: { type: String },
  },
  { timestamps: false }
);

// At most one PENDING suggestion per student (decided ones are kept as history)
tierSuggestionSchema.index({ studentId: 1 }, { unique: true, partialFilterExpression: { status: "PENDING" } });

export const TierSuggestionModel = mongoose.models.TierSuggestion || mongoose.model<TierSuggestion>("TierSuggestion", tierSuggestionSchema);
// One account per registration number (only users created through sign-up have one)
userSchema.index({ "signup.registrationNumber": 1 }, { unique: true, sparse: true });

// ---------------- Messages ----------------
/** Stored conversation: the public shape plus the recipient snapshot and who sent the latest message. */
export interface ConversationDocument extends Conversation {
  recipientStudentIds: string[];
  lastSenderKey: string;
  withdrawnBy?: string;
}

const messagePartySchema = new Schema(
  { userId: { type: String, required: true }, name: { type: String, required: true }, role: { type: String, required: true } },
  { _id: false }
);

const conversationSchema = new Schema<ConversationDocument>(
  {
    id: { type: String, required: true, unique: true },
    kind: { type: String, enum: ["DIRECT", "ANNOUNCEMENT"], required: true },
    subject: { type: String, required: true },
    priority: { type: String, enum: ["NORMAL", "IMPORTANT"], default: "NORMAL" },
    allowReplies: { type: Boolean, default: true },
    staff: { type: messagePartySchema, required: true },
    studentId: { type: String },
    studentName: { type: String },
    parentAnnouncementId: { type: String },
    audienceLabel: { type: String },
    recipientCount: { type: Number, required: true },
    // Recipients are fixed when the message is sent (students who join later don't receive old announcements)
    recipientStudentIds: { type: [String], index: true },
    createdAt: { type: String, required: true },
    lastMessageAt: { type: String, required: true },
    lastMessagePreview: { type: String, default: "" },
    lastSenderKey: { type: String, default: "" },
    withdrawnAt: { type: String },
    withdrawnBy: { type: String },
  },
  { timestamps: false }
);
conversationSchema.index({ "staff.userId": 1, lastMessageAt: -1 });
// At most one private reply thread per student per announcement
conversationSchema.index(
  { parentAnnouncementId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { parentAnnouncementId: { $exists: true } } }
);

const chatMessageSchema = new Schema<ChatMessage>(
  {
    id: { type: String, required: true, unique: true },
    conversationId: { type: String, required: true, index: true },
    sender: { type: messagePartySchema, required: true },
    body: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { timestamps: false }
);

/** When a reader (studentId for students, userId for staff) last opened a conversation. */
export interface ReadStateDocument {
  conversationId: string;
  readerKey: string;
  lastReadAt: string;
}
const readStateSchema = new Schema<ReadStateDocument>(
  {
    conversationId: { type: String, required: true },
    readerKey: { type: String, required: true },
    lastReadAt: { type: String, required: true },
  },
  { timestamps: false }
);
readStateSchema.index({ conversationId: 1, readerKey: 1 }, { unique: true });

export const ConversationModel = mongoose.models.Conversation || mongoose.model<ConversationDocument>("Conversation", conversationSchema);
export const ChatMessageModel = mongoose.models.ChatMessage || mongoose.model<ChatMessage>("ChatMessage", chatMessageSchema);
export const ReadStateModel = mongoose.models.ReadState || mongoose.model<ReadStateDocument>("ReadState", readStateSchema);

export const UserModel = mongoose.models.User || mongoose.model<User>("User", userSchema);



// ---------------- Phase 4: safeguards, hours and SLA ----------------
// Docs: docs/modules/safeguards.md and docs/modules/sla-and-delivery.md

/** D10: recorded work time (Start/Stop timer or typed in). */
const hourEntrySchema = new Schema<HourEntry>(
  {
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true, index: true },
    opportunityId: { type: String },
    date: { type: String, required: true },
    minutes: { type: Number, required: true, default: 0 },
    source: { type: String, enum: ["TIMER", "MANUAL"], required: true },
    startedAt: { type: String },
    endedAt: { type: String },
    note: { type: String },
    capped: { type: Boolean },
    createdBy: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { timestamps: false }
);
// HOURS-02: at most one running timer per student. A running timer is the only entry with `running: true`.
hourEntrySchema.add({ running: { type: Boolean } });
hourEntrySchema.index({ studentId: 1, running: 1 }, { unique: true, partialFilterExpression: { running: true }, name: "one_running_timer" });

/** D10: the Monday check-in (one per student per week). */
const weeklyCheckinSchema = new Schema<WeeklyCheckin>(
  {
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true },
    weekStart: { type: String, required: true },
    projects: [{ _id: false, opportunityId: { type: String }, title: { type: String }, plannedHours: { type: Number }, actualHours: { type: Number } }],
    otherPaidHours: { type: Number, default: 0 },
    totalHours: { type: Number, required: true },
    cap: { type: Number, required: true },
    overCap: { type: Boolean, required: true },
    note: { type: String },
    source: { type: String, enum: ["STUDENT", "AUTO"], required: true },
    submittedAt: { type: String, required: true },
    submittedBy: { type: String, required: true },
  },
  { timestamps: false }
);
weeklyCheckinSchema.index({ studentId: 1, weekStart: 1 }, { unique: true });

/** G5: soft-rule overrides (logged, with an expiry). */
const safeguardOverrideSchema = new Schema<SafeguardOverride>(
  {
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true, index: true },
    rule: { type: String, required: true },
    reason: { type: String, required: true },
    createdBy: { type: String, required: true },
    createdAt: { type: String, required: true },
    expiresAt: { type: String, required: true },
    revokedAt: { type: String },
    revokedBy: { type: String },
  },
  { timestamps: false }
);

/** G12: project timeline. `dedupeKey` (reminders only) makes "never send the same reminder twice" a database guarantee. */
export interface SlaEventDocument extends SlaEvent {
  dedupeKey?: string;
}
const slaEventSchema = new Schema<SlaEventDocument>(
  {
    id: { type: String, required: true, unique: true },
    opportunityId: { type: String, required: true, index: true },
    studentId: { type: String, required: true },
    type: { type: String, required: true },
    at: { type: String, required: true },
    by: { type: String, required: true },
    note: { type: String },
    dedupeKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: false }
);

/** G6: "Request help" from a blocked student. */
const helpRequestSchema = new Schema<HelpRequest>(
  {
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, required: true },
    rule: { type: String, required: true },
    reason: { type: String, required: true },
    opportunityId: { type: String },
    conversationId: { type: String, required: true },
    routedRole: { type: String, required: true },
    routedUserId: { type: String, required: true },
    routedUserName: { type: String, required: true },
    escalationLevel: { type: Number, default: 0 },
    status: { type: String, enum: ["OPEN", "RESOLVED"], required: true },
    createdAt: { type: String, required: true },
    escalatedAt: { type: String },
    resolvedAt: { type: String },
    resolvedBy: { type: String },
    outcome: { type: String },
  },
  { timestamps: false }
);
// HELP-01: one open request per student per rule
helpRequestSchema.index({ studentId: 1, rule: 1 }, { unique: true, partialFilterExpression: { status: "OPEN" } });

/** G7 / G12: when the daily checks last ran and what they did. */
export interface JobRunDocument {
  id: string;
  lastRunAt: string;
  summary: Record<string, number>;
}
const jobRunSchema = new Schema<JobRunDocument>(
  { id: { type: String, required: true, unique: true }, lastRunAt: { type: String, required: true }, summary: { type: Schema.Types.Mixed } },
  { timestamps: false }
);

export const HourEntryModel = mongoose.models.HourEntry || mongoose.model<HourEntry>("HourEntry", hourEntrySchema);
export const WeeklyCheckinModel = mongoose.models.WeeklyCheckin || mongoose.model<WeeklyCheckin>("WeeklyCheckin", weeklyCheckinSchema);
export const SafeguardOverrideModel = mongoose.models.SafeguardOverride || mongoose.model<SafeguardOverride>("SafeguardOverride", safeguardOverrideSchema);
export const SlaEventModel = mongoose.models.SlaEvent || mongoose.model<SlaEventDocument>("SlaEvent", slaEventSchema);
export const HelpRequestModel = mongoose.models.HelpRequest || mongoose.model<HelpRequest>("HelpRequest", helpRequestSchema);
export const JobRunModel = mongoose.models.JobRun || mongoose.model<JobRunDocument>("JobRun", jobRunSchema);
