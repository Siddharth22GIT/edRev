# EduRev

EduRev is a college-project operations workspace for managing student readiness, curated client opportunities, bids, academic safeguards, and programme-level reporting. It demonstrates the flow from student training to opportunity allocation without storing freelancing-platform credentials or taking any share of student earnings.

> **Status:** Week 9 build. Data is persisted in MongoDB, every API endpoint (except login and health) requires JWT authentication, and access is role-based. If MongoDB is unreachable, the API falls back to in-memory demo data and says so clearly (see [Demo data mode](#demo-data-mode)).

## Problem Statement

Students may be ready for external work, but institutions need a clear way to track training, academic eligibility, opportunities, and outcomes. EduRev provides a single workspace to demonstrate that process while protecting student privacy and academic priorities.

## Features

### Opportunity Bid Desk

- Browse opportunities and view their details.
- View client, skills, budget, deadline, tier requirement, estimated effort, and status.
- Submit a bid with amount, completion estimate, message, and relevant skills.
- Show validation, loading, success, and API-error feedback.
- Prevent a second bid from the same mock student for the same opportunity.
- Switch to an analyst demonstration role to review bids and attempt allocation.

### Student Progression

- Browse profiles with programme, course, year, skills, CGPA, tier, and training progress.
- View tier readiness, next-tier progress, and requirements.
- Use seed training modules with `COMPLETED`, `IN_PROGRESS`, and `NOT_STARTED` states.

### Academic Safeguards

Before allocation, the API checks the required tier, CGPA eligibility, weekly hour cap, exam blackout period, and compliance status. Failed checks block allocation with a clear reason. The API also includes a demonstration-only Faculty Director hour-cap override requiring a reason and role.

### Earnings and Reporting

- Earnings retain original amount/currency, historical exchange rate, and converted amount.
- Earnings can be `PENDING`, `VERIFIED`, or `REJECTED` through the representative API.
- Platform accounts contain only non-sensitive identifiers and status metadata.
- Analytics are aggregate programme metrics; there is no individual earnings leaderboard.

## Important Business Rules

- EduRev does **not** store platform passwords, API keys, access tokens, or credentials.
- The institution does **not** charge commission, deduct fees, or take a share of individual student earnings.
- Individual earnings are sensitive and are not presented as a global leaderboard.
- One bid per student per opportunity is enforced by a MongoDB unique index `unique(opportunityId, studentId)` (HTTP 409 on duplicates).
- Student identity always comes from the signed-in token, never from a request body.
- SLA fields are persisted on allocations, but SLA status is not yet advanced by a background job.

## Technology Stack

- Frontend: Next.js 15 App Router, React, TypeScript, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Repository: npm workspaces monorepo
- Shared packages: TypeScript contracts and mock data

## Project Structure

```text
edRev/
├── apps/
│   ├── web/                  # Next.js user interface
│   └── api/                  # Express HTTP API
├── packages/
│   ├── types/                # Shared domain contracts
│   └── mock-data/            # In-memory seed data and business rules
├── docs/                     # Architecture and evaluation documentation
├── package.json
└── README.md
```

## Architecture

```text
Browser
  ↓
Next.js App Router + reusable UI components
  ↓
Frontend API/data boundary
  ↓
Express routes → authenticate / permission middleware
  ↓
Controllers → services
  ↓
MongoDB (Mongoose models)  ── or, if unreachable ──  in-memory demo data
```

All screens call the Express API at `NEXT_PUBLIC_API_URL` (default: `http://localhost:4000/api`) through one authenticated helper, `useApi()` in `apps/web/lib/api.ts`. Workspace pages are only rendered for a signed-in user.

## User Roles

Sign in at `/login`. Development accounts (password `Password123!`): `student@`, `analyst@`, `editor@`, `guild@`, `coordinator@`, `faculty@`, `placement@`, `dean@`, `admin@revalanche.local`.

| Role | Main responsibilities |
| --- | --- |
| Student | View opportunities, submit one bid, submit earnings, view and update **own** progression only. |
| Bid Desk Analyst | Publish opportunities, review bids, allocate work. |
| Cell Coordinator | Allocate work, supervise training, override hour caps, verify earnings. |
| Faculty Director | Supervise training, override hour caps, verify earnings. |
| Guild Lead | Supervise student training and hours. |
| Dean | Verify earnings, view aggregate reporting. |
| Placement Office | View earnings and aggregate reporting. |
| Proposal Editor | Review bids and proposals. |
| Administrator | Everything above, plus official tier changes. |

The exact rules are in [docs/access-control.md](docs/access-control.md) and are defined once in `packages/types/src/permissions.ts`, which both the API and the UI use.

## Primary Workflow

```text
Student views opportunity
  → submits bid
  → analyst reviews bid
  → eligibility and academic safeguards run
  → opportunity is allocated or blocked with a reason
  → earning is recorded and verified
  → aggregate programme analytics are updated
```

## Routes

| Route | Description |
| --- | --- |
| `/dashboard` | Programme overview and key metrics |
| `/opportunities` | Opportunity pipeline |
| `/opportunities/[id]` | Details and interactive Bid Desk |
| `/students` | Student registry |
| `/students/[id]` | Student profile |
| `/students/[id]/tier` | Tier readiness and requirements |
| `/earnings` | Earnings reporting view |
| `/proposals` | Proposal workflow overview |
| `/safeguards` | Academic and operational controls |
| `/analytics` | Aggregate programme analytics |
| `/settings` | Demonstration workspace settings |

## Setup

### Prerequisites

- Node.js 20.9+ (Node 22+ recommended)
- npm 10+

### Install and Run

```bash
npm install
npm run dev
```

Open the frontend at `http://localhost:3000/dashboard` and verify the API at `http://localhost:4000/api/health`.

Run each service independently when needed:

```bash
npm run dev:web
npm run dev:api
```

## Environment Variables

Copy `.env.example` to `.env` if defaults need changing.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | Browser-visible API base URL |
| `API_PORT` | `4000` | Express server port |
| `WEB_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/edurev` | MongoDB connection string |
| `JWT_SECRET` | dev value | Secret used to sign login tokens (change in production) |
| `JWT_EXPIRES_IN` | `7d` | Login token lifetime |
| `REQUIRE_DB` | `false` | When `true`, the API refuses to start without MongoDB |

### Demo data mode

If MongoDB cannot be reached, the API keeps running on in-memory demo data so the project can still be demonstrated. When that happens:

- the API prints a **DEMO DATA MODE** banner at startup,
- `GET /api/health` returns `"db": "mock"` (otherwise `"connected"`),
- the web app shows a **Demo data mode** badge in the top bar.

Changes made in demo data mode are not saved. Set `REQUIRE_DB=true` to turn this fallback into a startup error.

## API Overview

All responses use JSON. Resource endpoints return `{ data }`; errors return `{ message }`. Every endpoint except `POST /api/auth/login` and `GET /api/health` requires `Authorization: Bearer <token>`; `401` means not signed in and `403` means not permitted.

| Area | Representative endpoints |
| --- | --- |
| Auth | `POST /api/auth/login`, `GET /api/auth/me` |
| Health/dashboard | `GET /api/health`, `GET /api/dashboard` |
| Opportunities | `GET/POST /api/opportunities`, `GET /api/opportunities/:id` |
| Bids/allocation | `GET/POST /api/opportunities/:id/bids`, `GET /api/opportunities/:id/bids/:bidId/proposal`, `POST /api/opportunities/:id/allocate`, `GET /api/opportunities/:id/allocation` |
| Students/training | `GET /api/students`, `GET /api/students/:id`, `/readiness`, `/tier`, `/training`, `PATCH /api/students/:id/training/:moduleId`, `PATCH /api/students/:id/tier` |
| Earnings | `GET/POST /api/earnings`, `PATCH /api/earnings/:id/verify` |
| Safeguards | `GET /api/safeguards/:studentId`, `GET/POST /api/hours`, `GET /api/blackouts`, `POST /api/safeguards/hour-cap/override` |
| Other | `GET /api/platform-accounts`, `GET /api/analytics`, `GET/POST /api/proposals`, `GET /api/settings`, `GET /api/academic/:studentId` |

## Data Model

The shared model includes:

- `Student`, `TierSummary`, `TrainingModule`, `AcademicSnapshot`, `HourLog`
- `Opportunity`, `Bid`, `Allocation`
- `EarningsEntry`, `PlatformAccount`
- `BlackoutPeriod`, `SafeguardCheck`, `Proposal`

See [docs/data-model.md](docs/data-model.md) for relationships and field-level notes.

## Quality Checks

```bash
npm run typecheck
npm test                                   # API tests against MongoDB
npm run test:mock --workspace @edurev/api  # same tests in demo data mode
npm run build
npm run check
```

`typecheck` validates all workspaces. `test` runs the API suites (earnings integrity and access control for every module). `build` produces the Next.js frontend and Express bundle. `check` runs typecheck and build.

If `npm run dev` is running, `next build` and `next dev` would both write to `apps/web/.next`. Build into a separate folder instead: `NEXT_DIST_DIR=.next-build npm run build --workspace @edurev/web`.

## Current Limitations

- Demo data mode (no MongoDB) keeps data in memory only; it resets on restart.
- There is no migration system yet; the database is seeded on first start.
- `POST /api/hours` validates access but does not yet persist hour entries.
- Proposals have no student id field, so the proposal list is not scoped per student.
- The web bundle still includes the shared mock package, which it uses as an offline fallback for first render.
- No external freelancing-platform integration is included.
- There are no restart-safe scheduled jobs for SLA or blackout enforcement.

## Future Scope

1. Add a repository layer and database migrations.
2. Persist hour logs and add a student id to proposals so they can be scoped.
3. Remove the mock-data fallback from the web bundle once the API is always available.
4. Add frontend and end-to-end tests.
5. Add persistent SLA jobs, notifications, audit logging, and production observability.

## Documentation

- [Architecture](docs/architecture.md)
- [Access control](docs/access-control.md)
- [Component tree](docs/component-tree.md)
- [Data model](docs/data-model.md)
- [Milestones](docs/milestones.md)
- [Week 5 checklist](docs/week5-checklist.md)
