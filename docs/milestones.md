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
- Implemented modular backend structure (`config/`, `models/`, `repositories/`, `services/`, `controllers/`, `routes/`)
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

## WEEK 9 — Upcoming Phases

- Phase 4: Training & Tier Persistence Engine
- Phase 5: Earnings Verification & Ledger Pipeline
- Phase 6: Academic Safeguards Persistence & Strict Enforcement
- Phase 7: Dynamic Database Analytics & Reporting



