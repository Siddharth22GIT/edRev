# Week 5 checklist

## Evaluation evidence

| Rubric | Evidence |
| --- | --- |
| Architecture & Design — 5 | Monorepo, shared entities, component tree, mock-data flow, role definitions. |
| React Routing & Implementation — 5 | App Router pages, navigation, reusable primitives, conditional Bid Desk UI. |
| Rendering / Data Fetching — 5 | Mock/API data, bid success/error/duplicate states, empty bid state. |
| Initial Backend & Database — 3 | Express endpoints, service-ready in-memory data layer, MongoDB plan documented. |
| Product Workflow — 3 | Bid → eligibility → allocation; earnings verification; safeguard override endpoints. |
| Documentation — 4 | README, architecture, data model, component tree, milestones. |

- [x] Empty repository inspected before setup.
- [x] npm workspaces configured for frontend, API, and shared packages.
- [x] Next.js App Router and TypeScript frontend configured.
- [x] Tailwind CSS configured.
- [x] Responsive `AppShell`, `Sidebar`, and `Topbar` implemented.
- [x] Reusable UI primitives established.
- [x] Requested dashboard and operations routes added.
- [x] Shared domain TypeScript contracts added.
- [x] Express server and read-only `/api` route structure added.
- [x] Shared mock data and lookup helpers added.
- [x] README and architecture/data/component/milestone docs added.
- [ ] Authentication and role permissions (deferred).
- [ ] Database schema, migrations, and persistence (deferred).
- [ ] Create/update/delete workflows (deferred).
- [ ] Payments, notifications, and external integrations (deferred).
- [ ] Production telemetry and test suite expansion (deferred).

## Verification commands

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

When both development servers are up, use `http://localhost:3000/dashboard` and `http://localhost:4000/api/health` to perform a basic smoke check.
