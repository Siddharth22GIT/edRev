# EduRev · REVALANCHE

A college operations workspace that takes students from training to real, paid client work without putting their studies at risk.

Students train, bid on curated client projects and get allocated work (subject to academic safeguards). They record their freelance earnings, and staff verify them. The institution sees aggregate reporting only. It takes **no commission** and **never stores platform passwords**.

## Architecture

![Architecture](docs/diagrams/architecture.png)

A TypeScript monorepo (npm workspaces):

| Workspace | What it is |
| --- | --- |
| `apps/web` | Next.js 15 App Router, React 19, Tailwind 3 |
| `apps/api` | Express 5 + Mongoose: `routes → middleware → controllers → services → models` |
| `packages/types` | Shared types, the role permission map (`PERMISSIONS`) and tier rules |
| `packages/mock-data` | Seed data, also used as "demo data mode" when MongoDB is down (dev only) |

Permissions and tier rules are defined once in `@edurev/types`, so the UI and the API always agree.

## Student journey

![Student journey](docs/diagrams/student-journey.png)

- **Tiers:** Starter → Skilled → Advanced → Elite. The system only *suggests* a tier; only an Administrator changes it.
- **Safeguards:** tier, official CGPA, weekly hours, exam blackout periods and compliance are checked before any allocation.

## Allocation

![Allocation flow](docs/diagrams/allocation.png)

Each project goes to exactly one student. An atomic database claim means that if two staff members click Allocate at the same time, one wins and the other gets `409`.

## Getting started

Requires Node.js 20.9+ and npm 10+. MongoDB at `127.0.0.1:27017` is optional; without it the API runs in demo data mode.

```bash
npm install
npm run dev        # web on http://localhost:3000, API on http://localhost:4000
```

Sign in with `student@revalanche.local` (or `analyst@`, `coordinator@`, `admin@` …) and password `Password123!`.

## Checks

```bash
npm run typecheck                          # all workspaces
npm test                                   # API tests against MongoDB
npm run test:mock --workspace @edurev/api  # same tests in demo data mode
npm run build
```

## More documentation

- [Architecture](docs/architecture.md) · [Access control](docs/access-control.md) · [Data model](docs/data-model.md)
- [Bids and allocation](docs/modules/bids-and-allocation.md) · [Security](docs/modules/security.md) · [Edge cases](docs/edge-cases.md)
- [Improvement plan](docs/improvement-plan.md)

Diagram sources are in [docs/diagrams/](docs/diagrams/) (`*.mmd`). To regenerate a PNG: `npx @mermaid-js/mermaid-cli -i docs/diagrams/<name>.mmd -o docs/diagrams/<name>.png -s 2 -b white`.
