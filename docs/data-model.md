# Data model

The initial contracts are in `packages/types/src/index.ts`. They model a read-oriented operations dashboard and deliberately omit persistence fields that have not been agreed yet.

## Core entities

| Entity | Key fields | Notes |
| --- | --- | --- |
| `Opportunity` | `id`, company, project, category, budget, matchScore, status, deadline | Potential work available to learners. |
| `Student` | `id`, profile fields, program, tier, status, progress, earnings, mentor | Current learner dashboard view. |
| `TierSummary` | studentId, current/next tier, progress, requirements | Derived progression state for a student. |
| `Proposal` | `id`, studentName, opportunityId, status, value | The pre-delivery work submission record. |
| `Safeguard` | `id`, name, owner, status, lastCheckedAt | Operational control and health signal. |

# Data Model

The baseline TypeScript contracts are defined in `packages/types/src/index.ts`. In Week 9 Phase 1, Mongoose schemas and models were introduced in `apps/api/src/models/index.ts` to provide persistent backend storage.

## Core Entities & Persistence Schemas

| Entity | Key Fields | Notes & Database Constraints |
| --- | --- | --- |
| `Student` | `id`, name, email, program, tier, status, progress, cgpa, earnings | Learner profile and progression snapshot. |
| `Opportunity` | `id`, company, project, category, budget, status, deadline, slaDeadline | Stage-gated client work item. |
| `Bid` | `id`, opportunityId, studentId, proposedAmount, status | Learner work proposal. **Database compound unique index:** `unique(opportunityId, studentId)` returning HTTP 409 on duplicate. |
| `Allocation` | `opportunityId`, studentId, allocatedBy, allocatedAt, slaStartAt, slaDeadline, slaStatus | Assigned work record with persistent SLA window (`ACTIVE`, `AT_RISK`, `COMPLETED`, `OVERDUE`, `CANCELLED`). |
| `EarningsEntry` | `id`, studentId, platformName, originalAmount, originalCurrency, exchangeRate, convertedAmount, verificationStatus | Learner freelancing earnings record. Strictly excludes login credentials/passwords. Preserves historical FX exchange rate. |
| `PlatformAccount` | `id`, studentId, platform, accountIdentifier, accountStatus, verificationStatus | Freelancing platform identity record without storing authentication credentials. |
| `TrainingModule` | `id`, studentId, title, status, completionPercentage | Learner skill development progression. |
| `AcademicSnapshot` | `studentId`, cgpa, requiredCgpa, cgpaStatus, complianceStatus | Institutional academic eligibility safeguards. |
| `HourLog` | `studentId`, period, allowedHours, loggedHours, status, overridden | Safeguard for student weekly work-hour cap. |
| `BlackoutPeriod` | `id`, title, startDate, endDate | Academic exam blackout windows during which new work is blocked. |
| `Proposal` | `id`, title, studentName, opportunityId, status, reviewStatus, version, value | Document proposal draft and submission tracking. |
| `Safeguard` | `id`, name, description, status, owner, lastCheckedAt | Operational health controls. |
| `Settings` | `id` ("default"), organizationName, notificationEmail, timezone | System configuration defaults. |

## Uniqueness & Safeguard Rules
1. **Duplicate Bid Protection**: Enforced at Mongoose schema level (`unique({ opportunityId: 1, studentId: 1 })`). Express controller catches code `11000` and emits `409 Conflict`.
2. **SLA Window**: `slaStartAt` and `slaDeadline` timestamps are persisted on `Allocation`. SLA status is derived dynamically from timestamps.
3. **No Platform Earnings Commission**: Individual student earnings are never taxed by the institution.
4. **Faculty Override**: Hour-cap overrides require `FACULTY_DIRECTOR` authority and audit reasoning.

