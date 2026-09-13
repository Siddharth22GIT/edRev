# EduRev

EduRev is a college-project operations workspace for managing student readiness, curated client opportunities, bids, academic safeguards, and programme-level reporting. It demonstrates the flow from student training to opportunity allocation without storing freelancing-platform credentials or taking any share of student earnings.

> **Status:** Week 5 demonstration build. The application uses realistic, mutable in-memory mock data—not a production database.

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
- The current one-bid rule is enforced by the mock API and UI. A production database must additionally enforce `unique(opportunityId, studentId)`.
- SLA background processing is not a persistent job yet.

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
Express routes
  ↓
In-memory mock data and eligibility rules
  ↓
MongoDB repository layer (future)
```

The web app uses shared mock data for initial rendering. The interactive Bid Desk calls the Express API at `NEXT_PUBLIC_API_URL` (default: `http://localhost:4000/api`).

## User Roles

The current role selector is a lightweight UI demonstration, not authentication.

| Role | Demonstrated responsibility |
| --- | --- |
| Student | View opportunities, submit one bid, view own progression. |
| Bid Desk Analyst | Review bids and request allocation. |
| Faculty Director | Demonstrate a reasoned hour-cap override. |
| Placement Office / Dean | View aggregate reporting only. |
| Other listed roles | Proposal Editor, Guild Lead, Cell Coordinator, Administrator. |

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

## API Overview

All responses use JSON. Resource endpoints return `{ data }`; errors return `{ message }`.

| Area | Representative endpoints |
| --- | --- |
| Health/dashboard | `GET /api/health`, `GET /api/dashboard` |
| Opportunities | `GET /api/opportunities`, `GET /api/opportunities/:id` |
| Bids/allocation | `GET/POST /api/opportunities/:id/bids`, `POST /api/opportunities/:id/allocate` |
| Students/training | `GET /api/students`, `GET /api/students/:id`, `GET /api/students/:id/tier`, `GET /api/students/:id/training` |
| Earnings | `GET/POST /api/earnings`, `PATCH /api/earnings/:id/verify` |
| Safeguards | `GET /api/safeguards/:studentId`, `GET/POST /api/hours`, `GET /api/blackouts`, `POST /api/safeguards/hour-cap/override` |
| Other | `GET /api/platform-accounts`, `GET /api/analytics`, `GET /api/proposals`, `GET /api/settings` |

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
npm run build
npm run check
```

`typecheck` validates all workspaces. `build` produces the Next.js frontend and Express bundle. `check` runs both.

## Current Limitations

- All data resets when the Express process restarts.
- There is no MongoDB connection, migration system, or durable unique constraint yet.
- Roles are UI demonstration state only; there is no login or authorization middleware.
- No external freelancing-platform integration is included.
- There are no restart-safe scheduled jobs for SLA or blackout enforcement.

## Future Scope

1. Add a repository layer, MongoDB schemas, migrations, and database constraints.
2. Add authentication, real role-based authorization, and audit logging.
3. Replace direct mock imports in server-rendered screens with an API client.
4. Add automated unit, integration, and end-to-end tests.
5. Add persistent SLA jobs, notifications, and production observability.

## Documentation

- [Architecture](docs/architecture.md)
- [Component tree](docs/component-tree.md)
- [Data model](docs/data-model.md)
- [Milestones](docs/milestones.md)
- [Week 5 checklist](docs/week5-checklist.md)
