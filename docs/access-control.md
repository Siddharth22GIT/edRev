# Access Control

Every API endpoint except `POST /api/auth/login` and `GET /api/health` requires a signed-in user (`Authorization: Bearer <JWT>`).

## Single source of truth

Role permissions live in one place: [`packages/types/src/permissions.ts`](../packages/types/src/permissions.ts).

- The **API** enforces them with `requirePermission(...)` and `requireSelfOrPermission(...)` in `apps/api/src/middleware/auth.middleware.ts`.
- The **web app** calls `can(role, permission)` to decide which buttons and forms to show.

Both sides read the same lists, so a button can never appear for a role the API would reject (or the reverse). To change who may do something, edit `PERMISSIONS` and both sides follow.

## Roles

`STUDENT`, `BID_DESK_ANALYST`, `PROPOSAL_EDITOR`, `GUILD_LEAD`, `CELL_COORDINATOR`, `FACULTY_DIRECTOR`, `PLACEMENT_OFFICE`, `DEAN`, `ADMINISTRATOR`.

"Staff" means every role except `STUDENT`.

## Permission table

| Permission | Allowed roles | Used by |
| --- | --- | --- |
| `OPPORTUNITY_CREATE` | Bid Desk Analyst, Cell Coordinator, Administrator | `POST /opportunities` |
| `OPPORTUNITY_ALLOCATE` | Bid Desk Analyst, Cell Coordinator, Administrator | `POST /opportunities/:id/allocate` |
| `BID_SUBMIT` | Student | `POST /opportunities/:id/bids` |
| `BID_REVIEW` | All staff | See every bid and proposal document (students see only their own) |
| `STUDENT_RECORDS_VIEW` | All staff | Any student's profile, readiness, tier, training, safeguards, hours, academic record (students see only their own) |
| `STUDENT_SUPERVISE` | Guild Lead, Cell Coordinator, Faculty Director, Administrator | Update another student's training; log hours on a student's behalf (students may do both for themselves) |
| `TIER_UPDATE` | Administrator | `PATCH /students/:id/tier` |
| `HOUR_CAP_OVERRIDE` | Faculty Director, Cell Coordinator, Administrator | `POST /safeguards/hour-cap/override` |
| `EARNINGS_SUBMIT` | Student | `POST /earnings` |
| `EARNINGS_VIEW_ALL` | Faculty Director, Cell Coordinator, Administrator, Dean, Placement Office | `GET /earnings`, `/earnings/summary`, `/platform-accounts` across students |
| `EARNINGS_VERIFY` | Faculty Director, Cell Coordinator, Administrator, Dean | `PATCH /earnings/:id/verify` |
| `PROFILE_EDIT_ANY` | Administrator | Edit any student's profile details and photo (students may always edit their own) |
| `SETTINGS_MANAGE` | Administrator | `PUT /settings` (institution-wide settings) |
| `ANALYTICS_VIEW` | All staff | `GET /analytics`, `GET /dashboard` (programme reporting is not student-facing) |
| `SIGNUP_REVIEW` | Cell Coordinator, Administrator | `GET /signup-requests`, `POST /signup-requests/:id/approve` / `reject` |
| `ACADEMIC_RECORD_MANAGE` | Faculty Director, Administrator | `PUT /academic/:studentId` (official CGPA) |
| `PROPOSAL_CREATE` | All roles | `POST /proposals` (a student is always recorded as the author) |

## Endpoint rules

| Endpoint | Rule |
| --- | --- |
| `GET /opportunities`, `/opportunities/:id`, `/opportunities/:id/allocation` | Any signed-in user |
| `GET /opportunities/:id/bids` | Staff: all bids. Student: only their own bid |
| `GET /opportunities/:id/bids/:bidId/proposal` | Staff, or the student who owns the bid |
| `GET /students` | Staff: whole cohort. Student: a list containing only themself |
| `GET /students/:id`, `/readiness`, `/tier`, `/training` | The student themself, or staff |
| `PATCH /students/:id/training/:moduleId` | The student themself, or `STUDENT_SUPERVISE` |
| `GET /safeguards/:studentId`, `/hours/:studentId`, `/academic/:studentId` | The student themself, or staff |
| `PATCH /students/:id/profile` | The student themself, or `PROFILE_EDIT_ANY`. Only `bio`, `phone`, `location`, `skills` are accepted; tier, CGPA, earnings and identity are ignored |
| `PUT` / `DELETE /students/:id/photo` | The student themself, or `PROFILE_EDIT_ANY`. PNG, JPEG or WebP data URL, max 512 KB, bytes must match the declared type |
| `PUT /students/:id/onboarding`, `POST /students/:id/onboarding/skip` | The student themself, or `PROFILE_EDIT_ANY`. Accepts skills, interests (fixed list), availability (1–20h), claimed CGPA (0–10, stored separately from the official CGPA), goals, public http(s) portfolio links. Never changes tier, CGPA or earnings |
| `GET /tier-suggestions`, `POST /tier-suggestions/:id/approve` / `dismiss` | `TIER_UPDATE` (Administrator). Approving applies the suggested tier; a decided suggestion returns 409 |
| `POST /auth/signup`, `GET /auth/signup-config` | **Public.** Students only (role is never accepted), exact allowed domains (`lpu.in` by default), one account per email and per registration number, 5 attempts/hour per address, hidden honeypot field. New accounts are `PENDING_APPROVAL`. 503 in demo data mode |
| `POST /auth/login` | Public. Pending/rejected status is only revealed after the correct password. 10 failed attempts per email+address in 15 minutes → 429 |
| `PUT /academic/:studentId` | `ACADEMIC_RECORD_MANAGE`. Official CGPA 0–10; sets eligibility from the required CGPA and keeps the profile CGPA in sync |
| `POST /opportunities/:id/delivery` | `OPPORTUNITY_ALLOCATE`. Confirms delivery once (409 after), records on-time vs the opportunity due date, adds one completed project |
| `GET /students/:id/delivery-record` | The student themself, or staff |
| `POST /hours` | Student: own hours only (identity from token). Supervisors: must name a `studentId` |
| `GET /safeguards`, `/blackouts`, `/settings`, `/proposals` | Any signed-in user |
| `GET /dashboard`, `/analytics` | `ANALYTICS_VIEW` (staff) |
| `PUT /settings` | `SETTINGS_MANAGE` (Administrator). Validates name, email, IANA timezone and digest flag |
| `POST /auth/password` | The signed-in user only; current password required; new password 8–128 chars with a letter and a number. 503 in demo data mode |
| `PATCH /auth/me/preferences` | The signed-in user only; `celebrations`, `reduceMotion`, `showBadges` (booleans) |

## Identity rules

- A student's identity always comes from the verified token (`studentId`), never from the request body. Bids, earnings, hours and proposals all follow this rule.
- The hour-cap override uses the approver's role from the token. Each override records `overrideReason`, `overriddenBy` (`ROLE:userId`) and `overriddenAt` on the hour log.

## Responses

- `401`: no token, or an invalid or expired token. The web app clears the session and returns to `/login`.
- `403`: signed in, but not allowed. Student-profile screens show "Profile Access Restricted".

## Tests

`apps/api/src/tests/access-control.test.ts` covers each rule above for anonymous, student, other-student and staff callers. Run `npm test` (MongoDB) and `npm run test:mock --workspace @edurev/api` (in-memory mode).
