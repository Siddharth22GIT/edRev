export type Role = "STUDENT" | "BID_DESK_ANALYST" | "PROPOSAL_EDITOR" | "GUILD_LEAD" | "CELL_COORDINATOR" | "FACULTY_DIRECTOR" | "PLACEMENT_OFFICE" | "DEAN" | "ADMINISTRATOR";
export type OpportunityStatus = "OPEN" | "UNDER_REVIEW" | "ALLOCATED" | "CLOSED";
export type StudentStatus = "ACTIVE" | "INACTIVE";
export type Tier = "TIER_1" | "TIER_2" | "TIER_3" | "TIER_4";
export type BidStatus = "SUBMITTED" | "WITHDRAWN";
export type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED";
export type HourStatus = "NORMAL" | "WARNING" | "BLOCKED";
export type ComplianceStatus = "COMPLIANT" | "WARNING" | "NON_COMPLIANT";
export interface Opportunity { id:string; title:string; project:string; description:string; client:string; company:string; category:string; skills:string[]; budget:number; currency:string; deadline:string; status:OpportunityStatus; requiredTier:Tier; estimatedHours:number; numberOfBids:number; slaDeadline:string; matchScore:number; deliverables:string[]; updatedAt:string; allocatedStudentId?:string; }
export interface Student { id:string; name:string; email:string; avatarInitials:string; program:string; course:string; year:number; tier:Tier; status:StudentStatus; skills:string[]; trainingProgress:number; progress:number; cgpa:number; joinedAt:string; projectsCompleted:number; earnings:number; mentor:string; }
export interface TierSummary { studentId:string; currentTier:Tier; nextTier:Tier|null; progressToNextTier:number; requirements:{label:string;completed:boolean}[]; completedTraining:number; }
export interface TrainingModule { id:string; title:string; description:string; status:"COMPLETED"|"IN_PROGRESS"|"NOT_STARTED"; completionPercentage:number; }
export interface Bid { id:string; opportunityId:string; studentId:string; proposedAmount:number; estimatedCompletionTime:string; message:string; relevantSkills:string; status:BidStatus; createdAt:string; }
export interface Allocation { opportunityId:string; studentId:string; allocatedBy:string; allocatedAt:string; status:"ALLOCATED"; }
export interface EarningsEntry { id:string; studentId:string; platformName:string; originalAmount:number; originalCurrency:string; exchangeRate:number; convertedAmount:number; convertedCurrency:string; earningDate:string; verificationStatus:VerificationStatus; evidence:string; evidenceStatus:"AVAILABLE"|"MISSING"; createdAt:string; verifiedBy?:string; verifiedAt?:string; }
export interface PlatformAccount { id:string; studentId:string; platform:string; accountIdentifier:string; accountStatus:"ACTIVE"|"INACTIVE"; verificationStatus:VerificationStatus; }
export interface AcademicSnapshot { studentId:string; cgpa:number; requiredCgpa:number; cgpaStatus:"ELIGIBLE"|"RESTRICTED"; complianceStatus:ComplianceStatus; }
export interface HourLog { studentId:string; period:string; allowedHours:number; loggedHours:number; remainingHours:number; status:HourStatus; overridden?:boolean; }
export interface BlackoutPeriod { id:string; title:string; startDate:string; endDate:string; }
export interface SafeguardCheck { studentId:string; tierEligible:boolean; cgpaEligible:boolean; hourEligible:boolean; blackoutEligible:boolean; complianceEligible:boolean; eligible:boolean; reasons:string[]; }
export interface DashboardMetrics { activeStudents:number; opportunityPipeline:number; monthlyEarnings:number; completionRate:number; totalBids:number; allocations:number; verifiedEarnings:number; complianceRate:number; }
export interface AnalyticsSnapshot { placementRate:number; proposalWinRate:number; averageResponseHours:number; learnerSatisfaction:number; weeklyActivity:{label:string;value:number}[]; studentsByTier:{tier:Tier;count:number}[]; }
export interface Proposal { id:string; title:string; studentName:string; opportunityId:string; author:string; status:"DRAFT"|"IN_REVIEW"|"APPROVED"|"SUBMITTED"; reviewStatus:"PENDING"|"APPROVED"; version:number; submittedAt:string|null; value:number; }
export interface Safeguard { id:string; name:string; description:string; status:"healthy"|"attention"|"blocked"; owner:string; lastCheckedAt:string; }
export interface SettingsSummary { organizationName:string; notificationEmail:string; weeklyDigestEnabled:boolean; timezone:string; }
export interface ApiError { message:string; }
