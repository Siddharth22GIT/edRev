<div align="center">

<img src="apps/web/app/icon.svg" alt="REVALANCHE logo" width="72" />

# EduRev · REVALANCHE

**From training to real client work, without putting studies at risk.**

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)

[Features](#features) · [Architecture](#architecture) · [Quick start](#quick-start) · [Scripts](#scripts) · [Docs](#documentation)

</div>

---

## About

EduRev is a role-based college workspace. Students train, bid on curated client projects and get allocated work, subject to academic safeguards. They record their freelance earnings, and staff verify them. The institution sees aggregate reporting only.

> The institution takes **no commission**, there is **no payment gateway**, and platform passwords or API keys are **never stored**.

## Features

| | |
| --- | --- |
| 🎓 **Onboarding** | Student self sign-up with a college email, coordinator approval, first-login wizard |
| 📚 **Training and tiers** | Four tiers (Starter → Elite). The system suggests a tier; only an Administrator approves it |
| 💼 **Bid desk** | One bid per student per project, PDF proposals, edit or withdraw while bidding is open |
| ⚖️ **Fair allocation** | Atomic claim, so exactly one student gets each project; reassignment needs a reason |
| 🛡️ **Academic safeguards** | Checks official CGPA, weekly hours, exam blackouts and compliance before allocating |
| 💰 **Earnings** | Proof screenshot, original currency kept, verified by faculty or the Dean |
| ✉️ **Messages** | Direct messages and announcements to a tier, a program or all students |
| 📊 **Analytics** | Aggregate program reporting, with no individual leaderboard |

## Architecture

<p align="center">
  <img src="docs/diagrams/architecture.png" alt="Architecture diagram" width="760" />
</p>

TypeScript monorepo with npm workspaces. Role permissions and tier rules are defined **once** in `@edurev/types` and used by both the web app and the API, so the UI never shows an action the server would refuse.

<details>
<summary><b>Student journey</b></summary>
<br/>
<p align="center">
  <img src="docs/diagrams/student-journey.png" alt="Student journey diagram" width="860" />
</p>
</details>

<details>
<summary><b>Allocation flow</b></summary>
<br/>
<p align="center">
  <img src="docs/diagrams/allocation.png" alt="Allocation flow diagram" width="760" />
</p>
</details>

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 3 |
| Backend | Express 5, Mongoose, JWT, helmet |
| Database | MongoDB (falls back to in-memory demo data in development) |
| Testing | `node:test`, run against MongoDB and in demo data mode |

## Quick start

**Prerequisites:** Node.js 20.9+, npm 10+. MongoDB at `127.0.0.1:27017` is optional; without it the API runs in demo data mode.

```bash
git clone https://github.com/ItsShivam05/edRev.git
cd edRev
npm install
cp .env.example .env   # defaults work for local development
npm run dev            # web → http://localhost:3000 · API → http://localhost:4000
```

### Demo accounts

Password for all accounts: `Password123!`

| Role | Email |
| --- | --- |
| Student | `student@revalanche.local` |
| Bid Desk Analyst | `analyst@revalanche.local` |
| Cell Coordinator | `coordinator@revalanche.local` |
| Faculty Director | `faculty@revalanche.local` |
| Administrator | `admin@revalanche.local` |

Also available: `editor@`, `guild@`, `placement@`, `dean@`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start web and API together |
| `npm run typecheck` | Type-check all workspaces |
| `npm test` | API tests against MongoDB |
| `npm run test:mock --workspace @edurev/api` | Same tests in demo data mode |
| `npm run build` | Production build of web and API |

## Project structure

```text
edRev/
├── apps/
│   ├── api/          Express API: routes → middleware → controllers → services → models
│   └── web/          Next.js app: pages in app/(workspace)/, screens in components/
├── packages/
│   ├── types/        shared types, PERMISSIONS, TIER_RULES
│   └── mock-data/    seed and demo data
└── docs/             architecture, access control, data model, module notes
```

## Documentation

| Document | Contents |
| --- | --- |
| [Architecture](docs/architecture.md) | Request flow and workspace responsibilities |
| [Access control](docs/access-control.md) | Roles, permissions and endpoint rules |
| [Data model](docs/data-model.md) | Collections, fields and unique indexes |
| [Bids and allocation](docs/modules/bids-and-allocation.md) | Bidding and allocation rules |
| [Security](docs/modules/security.md) | Sessions, uploads, rate limits, error handling |
| [Edge cases](docs/edge-cases.md) | Known edge cases and how each is handled |
| [Improvement plan](docs/improvement-plan.md) | Roadmap and open decisions |

## Contributing

1. Create a branch from `main`.
2. Keep changes additive: don't rename or remove existing fields, routes or exports.
3. Add an access-control test (401 / 403 / allowed) for every new endpoint.
4. Before opening a PR, run `npm run typecheck`, `npm test` and `npm run test:mock --workspace @edurev/api`.

Diagram sources live in [`docs/diagrams/`](docs/diagrams/). After editing a `.mmd` file, regenerate its image:

```bash
npx @mermaid-js/mermaid-cli -i docs/diagrams/<name>.mmd -o docs/diagrams/<name>.png -s 2 -b white
```
