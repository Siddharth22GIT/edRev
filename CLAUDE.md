# CLAUDE.md

Context for AI-assisted work on REVALANCHE / EduRev. Read this before changing anything.

## What this is

A college operations workspace: students train, bid on curated client work, get allocated (subject to academic safeguards), record freelance earnings that staff verify, and the institution sees aggregate reporting.

## Layout (npm workspaces)

- `apps/api`: Express 5 + Mongoose. `routes/` → `middleware/` → `controllers/` → `services/` → `models/`. No repository layer.
- `apps/web`: Next.js 15 App Router, React 19, Tailwind 3. All workspace pages are client components under `app/(workspace)/`.
- `packages/types`: shared domain types **and the role permission map** (`src/permissions.ts`).
- `packages/mock-data`: seed data. Seeds MongoDB on first start; is the API fallback when MongoDB is down ("demo data mode"); is the web app's offline first render.

## Commands

```bash
npm run dev                                 # web :3000 + api :4000 (needs MongoDB at 127.0.0.1:27017 for persistence)
npm run typecheck                           # all workspaces
npm test                                    # API tests against MongoDB
npm run test:mock --workspace @edurev/api   # same tests in demo data mode
NEXT_DIST_DIR=.next-build npm run build --workspace @edurev/web   # build while `npm run dev` is running
```

A change is done when typecheck, `npm test` and `test:mock` all pass, and the web build succeeds. Tests clean up their own records; keep it that way.
After a web build with `NEXT_DIST_DIR`, revert the auto-edits Next makes to `apps/web/next-env.d.ts` and `apps/web/tsconfig.json`.

Dev logins: `student@`, `analyst@`, `editor@`, `guild@`, `coordinator@`, `faculty@`, `placement@`, `dean@`, `admin@revalanche.local`, password `Password123!`.

## Business rules (do not break)

- No platform passwords, API keys or tokens are ever stored. Portfolio links / identifiers only.
- The institution takes **no commission**; there is no payment gateway.
- No public or individual earnings leaderboard; analytics are aggregate only.
- **Official tiers change only by an ADMINISTRATOR.** Training, onboarding or any automation may *suggest* a tier, never set it.
- Official CGPA comes from the academic record (`AcademicSnapshot`). Student-entered CGPA is a claim, not a replacement: the CGPA safeguard depends on the official value.
- A student's identity always comes from the verified token (`req.user.studentId`), never from the request body.
- One bid per student per opportunity (unique DB index; 409 on duplicates).
- New earnings start `PENDING`; only verifier roles move them to `VERIFIED` / `REJECTED`.

## Access control

- Every API route except `POST /api/auth/login` and `GET /api/health` uses `authenticate`.
- Role rules live only in `PERMISSIONS` (`packages/types/src/permissions.ts`). The API enforces them with `requirePermission(...)` / `requireSelfOrPermission(...)`; the web app shows or hides controls with `can(role, permission)`. Add new permissions there; never hard-code role lists in screens or routes.
- Student-owned data: a student sees only their own records; staff roles with the permission see all. See `docs/access-control.md`.
- Add an access-control test (401 / 403 / allowed) for every new endpoint in `apps/api/src/tests/`.

## How to change things

- **Additive only.** Add optional fields, new collections, new endpoints and new screens. Do not rename or remove existing fields, response shapes, routes or exports. Existing response bodies are `{ data }`, errors `{ message }`.
- Every service supports both modes: `if (isDbConnected()) { …Mongo… } else { …mock-data… }`.
- Uploads (images, PDFs) are stored as data URLs in MongoDB, as bids and earnings already do. Validate type and size on the server.
- Frontend API calls go through `useApi()` (`apps/web/lib/api.ts`), never bare `fetch`, except the public `/health` check.
- Large screens live one-per-file in `components/screens/<area>/`; the old `*-screens.tsx` files are re-export barrels that keep page imports stable.

## Frontend building blocks

- Palette: orange `#F2A65A` (hover `#E59443`, dark text `#C27803`, light `#FEF6EE`, border `#FBD7B3`), blue `#3978B8` (dark `#204D7D`, light `#EFF6FC`, border `#C2DCF2`), charcoal text `#30343B`, muted `#666D7A`, page `#F7F7F6`, borders `#E6E6E6`.
- Brand: `LogoMark` (`components/ui/logo.tsx`, mountains + rising line; keep `app/icon.svg` in sync). Dark gradient hero `from-[#30343B] via-[#2B3F58] to-[#204D7D]` via `HeroBanner`.
- Shared UI: `Card`, `Button`, `Badge`, `StatusBadge`, `EmptyState`, `Skeleton`/`SkeletonRows`, `ProgressBar`, `HeroBanner`, `JourneyStepper`/`MountainProgress` (`components/student/journey.tsx`).
- App services: `useToast()` (never `alert()`), `celebrate()` snow burst for completed actions, `useWorkQueue()` for "waiting for you" counts and sidebar badges, `useQuickAction()` / `quickActions` for "+ New" and the Ctrl+K command bar, `navigationFor(role)` for the sidebar.
- Motion: `rise-in`, `page-fade`, `drawer-in`, `logo-pop` classes in `globals.css`; all respect `prefers-reduced-motion`. Do not use `animation-fill-mode: both` on wrappers that contain fixed-position modals (it traps them under the top bar).
- Full-screen overlays inside `space-y-*` containers need `!mt-0`.
- Verify UI changes with screenshots for at least a student and a staff role.
- Hide a page in three places: `navigation.ts` (`visibleTo`), a `RequirePermission` page guard, and the API route. Hiding a link alone is not access control.
- Personal preferences live on `user.preferences` (`useAuth().updateUser`); `AppShell` mirrors them onto `<html data-reduce-motion / data-celebrations>`. Use `prefersReducedMotion()` / `celebrationsEnabled()` from `lib/motion.ts`.

## Roadmap (agreed, in order)

1. ✅ Profile menu + profile page + photo upload (`/profile`, `MyProfileProvider`, `PATCH /students/:id/profile`, `PUT|DELETE /students/:id/photo`)
   ✅ Settings split: `/settings` (Admin, `SETTINGS_MANAGE`, real save) vs `/settings/account` (everyone: password, preferences). Students don't see Students list or Analytics (`ANALYTICS_VIEW`). Page guard: `RequirePermission`.
2. First-login onboarding wizard (skills, claimed CGPA, goals, links) + admin tier *suggestions*
3. "My Messages" + staff announcements (`MESSAGE_SEND` permission, per-student read state)
4. Extras: skill-based match score, achievement badges, saved opportunities, portfolio links, mentor skill endorsements, dark mode, deadline reminders
