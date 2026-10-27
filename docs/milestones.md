# Milestones

## WEEK 5 — foundation + representative core flow (complete)

- npm-workspaces monorepo
- Next.js App Router frontend and Express API
- App shell, route hierarchy, reusable components, and static screens
- Shared type contracts and mock read model
- Read-only API endpoints and project documentation

# Milestones

## WEEK 5 — foundation + representative core flow (COMPLETED)

- npm-workspaces monorepo
- Next.js App Router frontend and Express API
- App shell, route hierarchy, reusable components, and static screens
- Shared type contracts and mock read model
- Read-only API endpoints and project documentation

## WEEK 9 — Phase 1: MongoDB Persistence & Architecture (COMPLETED)

- Integrated Mongoose ODM & `dotenv` into `@edurev/api`
- Implemented modular backend structure (`config/`, `models/`, `services/`, `controllers/`, `routes/`; services use the Mongoose models directly, with no separate repository layer)
- Created 13 Mongoose persistence schemas with string ID compatibility
- Implemented database-level compound unique index `unique(opportunityId, studentId)` for duplicate bid prevention returning HTTP 409 Conflict
- Created automated database seeder (`seed.ts`) to populate MongoDB with initial dataset on boot
- Implemented persistent SLA fields (`slaStartAt`, `slaDeadline`, `slaStatus`) on Allocations
- Preserved 100% of Week 5 UI and API compatibility
- Verified workspace with clean `npm run typecheck` and `npm run build`

## WEEK 9 — Phase 2: Authentication & RBAC Foundation (COMPLETED)

- Implemented Mongoose User Model with bcrypt password hashing (`passwordHash`)
- Created Auth endpoints: `POST /api/auth/login` and `GET /api/auth/me`
- Created JWT verification and environment configuration (`JWT_SECRET`, `JWT_EXPIRES_IN`)
- Implemented `authenticate` and `requireRole(...roles)` Express middlewares
- Protected key endpoints:
  - `POST /api/opportunities/:id/bids` -> `STUDENT`
  - `POST /api/opportunities/:id/allocate` -> `BID_DESK_ANALYST`, `ADMINISTRATOR`
  - `POST /api/safeguards/hour-cap/override` -> `FACULTY_DIRECTOR`, `ADMINISTRATOR`
  - `PATCH /api/earnings/:id/verify` -> `FACULTY_DIRECTOR`, `ADMINISTRATOR`
  - `PATCH /api/students/:id/tier` -> `ADMINISTRATOR` (Strict Admin-only Tier Control)
- Created 6 idempotent development seed users (`student@revalanche.local`, `analyst@revalanche.local`, `faculty@revalanche.local`, `placement@revalanche.local`, `dean@revalanche.local`, `admin@revalanche.local` with `Password123!`)
- Created Next.js Login Page (`/login`) with dev role shortcuts
- Replaced demo role selector in `BidDesk` and header with real authenticated session context
- Verified workspace with clean `npm run typecheck` and `npm run build`

## WEEK 9 — Phase 3: Real Bid Desk + Allocation + SLA Workflow (COMPLETED)

- Integrated authenticated student identity enforcement on bid submission (`POST /api/opportunities/:id/bids`) using `req.user.studentId`
- Database-level duplicate bid prevention (`unique(opportunityId, studentId)`) emitting clean HTTP 409 Conflict error
- Implemented eligibility safeguard checks (academic CGPA + weekly work-hour cap) prior to work allocation
- Created persistent `Allocation` record with restart-safe SLA fields (`allocatedAt`, `slaStartAt`, `slaDeadline`, `slaStatus`)
- Added `GET /api/opportunities/:id/allocation` endpoint to retrieve persistent SLA details
- Updated Bid Desk UI (`BidDesk`) to dynamically render student bidding, analyst review, and live SLA tracking dashboard cards
- Preserved strict Admin-only tier control (`PATCH /api/students/:id/tier`)
- Verified workspace with clean `npm run typecheck` and `npm run build`

## WEEK 9 — Phase 4: Training, Tier Progression & Academic Safeguards (COMPLETED)

- Implemented Student Readiness Summary service (`getStudentReadinessService`) aggregating student profile, academic snapshot, training progress, weekly hours, exam blackout, and safeguard checks.
- Completed Training Module persistence and progress tracking (`updateTrainingModuleStatusService` & `PATCH /api/students/:id/training/:moduleId`).
- Enforced Institutional Safeguard rule: Training module completion updates readiness indicators as supporting information, but **DOES NOT** automatically alter official student tiers.
- Enforced strict Admin-Only Tier Control (`PATCH /api/students/:id/tier` restricted to `ADMINISTRATOR` with HTTP 403 Forbidden for all non-admin roles).
- Updated student screens (`StudentDetailScreen` & `StudentTierScreen`) with real-time readiness dashboard, training module status toggles, and Administrator tier controls.
- Integrated hourly cap override permissions (`FACULTY_DIRECTOR`, `CELL_COORDINATOR`, `ADMINISTRATOR`).
- Maintained Phase 3 Bid Desk allocation, duplicate bid protection, persistent SLA, and MongoDB persistence.
- Verified workspace with clean `npm run typecheck` and `npm run build`.

## WEEK 9 — Phase 5: Earnings Verification & Ledger Pipeline (COMPLETED)

- Implemented authenticated student earnings submission (`POST /api/earnings`) deriving student identity from `req.user.studentId`.
- Guaranteed initial state `PENDING` for all new earnings records (students cannot submit directly as `VERIFIED`).
- Implemented server-side duplicate earning submission prevention (`studentId + platformName + originalAmount + earningDate`).
- Preserved original currency (`originalAmount`, `originalCurrency`) with FX conversion stored separately (`convertedAmount`, `convertedCurrency`, `exchangeRate`).
- Enforced privacy rules on `GET /api/earnings` & `GET /api/earnings/summary` (students can view only their own earnings).
- Implemented institutional verification desk (`PATCH /api/earnings/:id/verify`) protected by `authenticate` + `requireRole("FACULTY_DIRECTOR", "CELL_COORDINATOR", "ADMINISTRATOR")`.
- Supported explicit status transitions: `PENDING` -> `VERIFIED` (updates student verified earnings) or `PENDING` -> `REJECTED` (persists verifier identity, timestamp, and rejection rationale).
- Strictly enforced rules: No payment gateway, no institution percentage deduction/commission, no platform password storage, no public earnings leaderboard.
- Updated frontend UI (`EarningsScreen`) with student submission form, verified/pending totals, and institutional verifier workflow.
- Verified workspace with clean `npm run typecheck` and `npm run build`.

## WEEK 9 — Phase 7: Dynamic Database Analytics & Reporting (COMPLETED)

- Implemented database-backed dynamic analytics engine in `apps/api/src/services/analytics.service.ts`.
- Sourced `activeStudents`, `opportunityPipeline`, `totalBids`, `allocations`, and `verifiedEarnings` dynamically from MongoDB collections.
- Implemented calendar month verified earnings filtering (`monthlyEarnings`), ensuring zero remains zero and never falls back to mock figures.
- Calculated academic `complianceRate` from `AcademicSnapshotModel` (`COMPLIANT` / total).
- Calculated cohort `completionRate` from active students' average training progress (`StudentModel.trainingProgress`).
- Implemented `placementRate` based on distinct allocated students divided by active students.
- Implemented `proposalWinRate` based on approved proposals vs. submitted proposals in `ProposalModel`.
- Sourced `averageResponseHours` from actual bid submission to allocation timestamp delta; returns `null` when insufficient timestamp records exist.
- Returned `null` for `learnerSatisfaction` until genuine survey evaluation instruments exist, prohibiting fabricated satisfaction scores.
- Implemented Monday–Sunday weekly activity grouping across bids, allocations, proposals, and earnings submissions with zero-count days included.
- Preserved dynamic `studentsByTier` cohort breakdown via MongoDB aggregation.
- Protected `GET /api/dashboard` and `GET /api/analytics` with `authenticate` middleware.
- Enforced strict student privacy: aggregate-only data, zero individual student earnings leak, and complete ban on public earnings leaderboards.
- Integrated `DashboardOverview` and `AnalyticsScreen` on Next.js frontend with live API fetching, session context, loading/error states, and live activity chart.
- Verified workspace with clean `npm run typecheck`, `npm run build`, and `npm run check`.

## WEEK 9 — Phase 8: Access Control Hardening & Consistency (COMPLETED)

- Required authentication on every endpoint except `POST /api/auth/login` and `GET /api/health`.
- Added one shared permission map (`packages/types/src/permissions.ts`) used by both API middleware and UI controls.
- Scoped student-owned data: students can only read their own profile, readiness, tier, training, safeguards, hours, academic record, bids and proposal documents.
- Restricted publishing opportunities to Bid Desk Analyst, Cell Coordinator and Administrator.
- Fixed the hour-cap override trusting a `role` field from the request body; it now uses the signed-in user, allows Faculty Director, Cell Coordinator and Administrator, and records reason, approver and time.
- Students now always author their own proposals and log only their own hours.
- Added an authenticated web API client (`useApi`) and a workspace `AuthGate`; proposal documents are downloaded with the session token.
- Made the in-memory fallback visible (startup banner, `db` field on `/api/health`, "Demo data mode" badge) and added `REQUIRE_DB`.
- Added `access-control.test.ts` (24 tests), runnable against MongoDB (`npm test`) and in demo data mode (`npm run test:mock --workspace @edurev/api`).
- Split the large operations and student screen files into one file per screen, without changing behaviour.
