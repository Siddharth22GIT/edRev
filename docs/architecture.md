# Architecture

## Intent

The Week 5 architecture optimizes for a clear seam between interface work and future services. It is a monorepo with one frontend, one API, and two shared packages.

## Request/data flow

```text
Browser → Next.js / React → frontend API/data layer → Express API
→ routes → controller/service seam → mock model/data layer → MongoDB (future)
```

The current process-memory data is deliberately shared by the API and UI seed screens. MongoDB is an architecture target only; it is not connected. A future database must enforce `unique(opportunityId, studentId)` for bids. SLA countdown is browser-calculated; production tracking needs restart-safe backend jobs.

```text
Browser
  │
  ├── apps/web (Next.js App Router)
  │     ├── AppShell, Sidebar, Topbar
  │     ├── Route screens
  │     └── @edurev/mock-data (temporary read model)
  │
  └── apps/api (Express)
        ├── /api/* read endpoints
        └── @edurev/mock-data (temporary read model)

Shared contracts: @edurev/types
```

## Workspace responsibilities

| Workspace | Responsibility |
| --- | --- |
| `apps/web` | Presentation, routing, responsive app shell, and reusable UI components. |
| `apps/api` | HTTP boundary, CORS, status handling, and read-only resource endpoints. |
| `packages/types` | Domain interfaces and allowed status values. |
| `packages/mock-data` | In-memory fixtures and lookup helpers used by both runtime applications. |

## Frontend design

The Next.js application uses the App Router. A `(workspace)` route group applies `AppShell` without changing public URLs. Dynamic routes use the App Router’s asynchronous `params` contract. Screens are server components unless a browser-only behavior is required; `AppShell` and `Sidebar` are client components for responsive navigation and active-route state.

The frontend reads the shared mock package directly for Week 5. In the next phase, a small API client can replace those imports without changing UI component contracts.

## API design

`createApp()` is kept separate from the network listener to make future API tests straightforward. The server currently exposes only `GET` endpoints. It returns `{ data }` for resources and `{ message }` for errors. `GET /api/dashboard` returns its own shaped overview payload.

There is intentionally no persistence, mutation, authentication, authorization, job queue, or third-party integration yet.

## Environment

| Variable | Default | Use |
| --- | --- | --- |
| `API_PORT` | `4000` | Express listening port. |
| `WEB_ORIGIN` | `http://localhost:3000` | CORS origin permitted by the API. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | Reserved public API base URL for the future frontend client. |

## Future integration path

1. Replace `packages/mock-data` calls in API routes with repositories.
2. Add a web API client, request validation, and loading/error states.
3. Introduce identity, roles, and policy checks before write endpoints.
4. Add a database and migrations behind repository interfaces.
5. Add observability, tests, and deployment configuration.
