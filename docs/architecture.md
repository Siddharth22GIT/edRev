# Architecture

## Intent

EduRev is a monorepo with one frontend, one API, and two shared packages. The API is the only source of truth for data and permissions; the web app is a client of it.

## Request/data flow

```text
Browser
  → Next.js screen (client component)
  → useApi() in apps/web/lib/api.ts          (attaches the Bearer token, handles 401)
  → Express route
  → authenticate + requirePermission / requireSelfOrPermission
  → controller (input + per-student scoping)
  → service
  → Mongoose model → MongoDB
       └─ if MongoDB is unreachable: in-memory data from @edurev/mock-data ("demo data mode")
```

```text
Browser
  │
  ├── apps/web (Next.js App Router)
  │     ├── AuthProvider (session) → AuthGate → AppShell (Sidebar, Topbar)
  │     ├── Route screens (components/screens/*)
  │     └── useApi() API client
  │
  └── apps/api (Express)
        ├── routes → middleware → controllers → services
        ├── models (Mongoose) + seed
        └── @edurev/mock-data (fallback when MongoDB is down)

Shared: @edurev/types (domain types + permission map)
```

## Workspace responsibilities

| Workspace | Responsibility |
| --- | --- |
| `apps/web` | Presentation, routing, session handling, and reusable UI components. |
| `apps/api` | HTTP boundary, authentication, authorization, business rules, and persistence. |
| `packages/types` | Domain interfaces, status values, and the role permission map (`permissions.ts`). |
| `packages/mock-data` | In-memory fixtures. Used to seed MongoDB, as the API's fallback in demo data mode, and as the web app's offline first render. |

## Backend structure

```text
apps/api/src
├── config/db.ts          MongoDB connection + isDbConnected()
├── middleware/           authenticate, requireRole, requirePermission, requireSelfOrPermission
├── routes/               URL → middleware → controller
├── controllers/          request parsing, per-student scoping, status codes
├── services/             business rules; each checks isDbConnected() and uses Mongo or mock data
├── models/               Mongoose schemas (unique bid index, SLA fields, override audit fields)
├── utils/seed.ts         seeds an empty database + development users
└── tests/                node:test suites (earnings integrity, access control)
```

There is no separate repository layer; services talk to Mongoose models directly.

## Authentication and authorization

- `POST /api/auth/login` returns a JWT. The web app stores it and sends it on every request.
- `authenticate` verifies the token and sets `req.user`.
- Role rules come from `PERMISSIONS` in `@edurev/types`. The same map drives which controls the UI shows.
- Student-owned data uses `requireSelfOrPermission`: a student may act on their own record, and staff holding the permission may act on any.

See [access-control.md](access-control.md) for the full table.

## Frontend design

The App Router `(workspace)` route group wraps every workspace page in `AuthGate` and `AppShell`. `AuthGate` waits for the session to be restored and sends anonymous users to `/login`, so screens only mount once a token is available.

Large screen modules are split one-per-file (`components/screens/operations/*`, `components/screens/students/*`). The original `operations-screens.tsx` and `student-screens.tsx` re-export them, so page imports are unchanged.

## Demo data mode

If MongoDB is unreachable at startup, the API keeps serving in-memory data and makes it visible: a startup banner, `GET /api/health` returns `db: "mock"`, and the web top bar shows a "Demo data mode" badge. `REQUIRE_DB=true` turns this into a startup error.

## Environment

| Variable | Default | Use |
| --- | --- | --- |
| `API_PORT` | `4000` | Express listening port. |
| `WEB_ORIGIN` | `http://localhost:3000` | CORS origin permitted by the API. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | API base URL used by the web app. |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/edurev` | MongoDB connection. |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | dev value / `7d` | Token signing. |
| `REQUIRE_DB` | `false` | Refuse to start without MongoDB. |
| `NEXT_DIST_DIR` | `.next` | Optional build output folder (lets `next build` run alongside `next dev`). |

## Next steps

1. Add a repository layer and migrations.
2. Persist hour logs; add a student id to proposals so they can be scoped.
3. Add restart-safe SLA jobs, audit logging, and observability.
