# Improvement plan: full to-do list

Everything we agreed to change, in the order we'll do it. Nothing here is built yet.
Written 30 Oct 2026. Edge-case details live in [edge-cases.md](edge-cases.md). IDs (S1, BID-04, G3…) match that file.

**Status key:** ☐ not started · ◐ in progress · ☑ done

---

## How we work on every item

1. **Read the docs for the module first** (`docs/modules/<module>.md`).
2. **Write the test first**, named with the item's ID. Then write the code.
3. **Follow CLAUDE.md.** Changes are additive only; both MongoDB and demo data mode must work; permissions go in `PERMISSIONS`; every new endpoint gets a 401/403/allowed test.
4. **Update the docs in the same change** (see the doc map in section 9). A change isn't done until its docs are.
5. **Done means:** `npm run typecheck`, `npm test`, `test:mock` and the web build all pass, plus screenshots for one student and one staff role for any UI change.

### Module doc template (every `docs/modules/*.md` uses this)

```
# <Module>
1. What it does            (2–3 sentences, plain words)
2. Flow                    (step-by-step diagram)
3. Rules                   (the business rules, with the numbers)
4. Data                    (collections and fields, new ones marked "new")
5. API                     (endpoint · permission · request → response · errors)
6. Edge cases              (ID · what can happen · how we handle it)
7. Tests                   (test file, and what each test proves)
8. How to change it safely (where the rules live, what else breaks)
```

---

## 0. Decisions needed (my recommended default in bold)

These block Phases 2 and 4. If you agree with the defaults, we go with them.

| # | Question | Recommended default |
|---|---|---|
| D1 | Weekly hour cap | **10 h/week in term, 20 h/week in breaks** |
| D2 | Attendance threshold | **75%** |
| D3 | Parallel active projects per tier | **T1 = 1, T2 = 1, T3 = 2, T4 = 3** |
| D4 | Extensions | **1 per project, at most 30% of the original duration, asked for before the deadline** |
| D5 | Reliability cool-down | **2 overdue in 60 days → no new allocations for 14 days (staff can override)** |
| D6 | What "on time" is measured against | **The allocation's agreed deadline (`slaDeadline`, plus approved extensions).** `deadline` stays the client's due date. A new optional `bidsCloseAt` sets when bidding closes. |
| D7 | Allocate to a student who didn't bid? | **No. Admin-only "direct assignment" with a reason, recorded in the audit log.** |
| D8 | Clients | **One-time feedback links, no client accounts** |
| D9 | Login token | **Now: 1-day expiry plus a `tokenVersion` check. Later: move to an httpOnly cookie.** |

---

## Phase 0: Housekeeping

| ☐ | ID | Change |
|---|---|---|
| ☐ | H1 | Commit Phase 3 (Messages) and the Tailwind fix as two commits. |
| ☐ | H2 | Dismiss the stale tier suggestion for Rohan (stu-202). |
| ☐ | H3 | Update `README.md` (sign-up, tiers, delivery, messages). |

---

## Phase 1: Security and safety

Goal: no one can get in or break data in ways they shouldn't. **Doc:** [`docs/modules/security.md`](modules/security.md).

**Status (30 Oct 2026):** done, apart from S12 (validation done; storing hours moved to G2) and S13 (see the security doc).

| ☐ | ID | Change | Edge cases handled | Test |
|---|---|---|---|---|
| ☑ | S1 | Demo data mode only in development and tests. In production, a database outage returns **503** instead of logging people in with the dev password. | DB drops mid-session; DB down at startup; `test:mock` must still work | Logging in with the production flag and no DB returns 503 |
| ☑ | S2 | The API refuses to start in production without a `JWT_SECRET` of 32+ characters. | Missing, empty or default secret | Startup check unit test |
| ☑ | S3 | Proposal PDFs checked on the server: must start with `%PDF`, ≤ 10 MB, always served as `application/pdf` with `nosniff`. | HTML or SVG renamed to `.pdf`; empty file; huge file; bad data URL | Upload fake PDF → 400; download headers |
| ☑ | S5 | Login tokens last 1 day and include a `tokenVersion`, which `authenticate` checks against the user. A password change, deactivation or role change increases it, so old tokens stop working. | Deactivated user with a valid token; role changed mid-session; password changed on another device | Old token → 401 after a password change |
| ☑ | S7 | `helmet` security headers on the API; a Content Security Policy on the web app. | Inline styles Next needs; data-URL images (photos) | Headers present |
| ☑ | S8 | Request size: 100 KB by default, larger only on the upload routes. | Upload routes still accept their files | Big body on a normal route → 413 |
| ☑ | S9 | Rate limits on bids, earnings, messages and uploads (per user). | Shared college IP (limit by user, not IP); restart resets limits (documented) | 429 after the limit |
| ☑ | S10 | Earnings `screenshotUrl` checked like photos (image type, real bytes, size). | Text pretending to be an image; `javascript:` URL | Bad screenshot → 400 |
| ☑ | S11 | One central error handler and a shared `AppError(message, status)` (replaces 4 copies of `httpError`). Users never see raw database errors. | `E11000` → 409 with a friendly message; unknown error → 500 "Something went wrong" | Duplicate key → friendly 409 |
| ◐ | S12 | Hour log `POST` saves for real, or returns 501 until it does. | Student logging hours for someone else (already 403) | Saved and readable back |
| ◐ | S13 | Run `npm audit` and update risky packages. | Breaking upgrades (pin and note) | All tests pass |

---

## Phase 2: Bids and allocation integrity

Goal: bidding and allocation can't produce wrong data, even with two people acting at once. **Doc:** `docs/modules/bids-and-allocation.md`.

| ☐ | ID | Change | Edge cases handled | Test |
|---|---|---|---|---|
| ☐ | E1 (S4, ALLOC-01/02) | **Atomic claim on allocate:** set the opportunity to ALLOCATED only if it's still OPEN or UNDER_REVIEW, all in one update. Bids and the allocation change only after the claim succeeds. | Two staff at once; out-of-date page; already completed work; safeguards fail after the claim (undo the claim) | Two parallel allocate calls → one 200, one 409; completed → 409 |
| ☐ | E1b | A separate **Reassign** action (Admin or Coordinator) with a reason, logged. | Reassign completed work (blocked); reassign to an ineligible student (blocked) | 403 / 409 / 200 cases |
| ☐ | E2 (BID-04/05) | Bids accepted only while the opportunity is OPEN or UNDER_REVIEW and before `bidsCloseAt`. A bid never moves the status backwards. | Bid on allocated or closed work; bid one second after closing; timezone of the close time | 409 for each case |
| ☐ | E3 (BID-01/02) | `$inc` for the bid count; `randomUUID()` for bid ids. A duplicate key error says "already bid" only when it really is the same student. | Two students in the same millisecond; same student, two tabs | 20 parallel bids → count = 20 |
| ☐ | E4 (BID-06–09) | Checks at bid time: tier (403), safeguards (a **warning** returned with the bid), amount must be positive (above budget is allowed but flagged), PDF checks (S3). | Tier dropped after viewing; amount `"abc"`, `-5`, `0` | Each case |
| ☐ | E5 (BID-10/11) | Students can **edit or withdraw** while the bid is SUBMITTED. On allocation, other bids become REJECTED and those students get a message. | Withdraw after allocation (409); bid again after withdrawing (allowed); message delivery failing (bid still rejected; retried) | Withdraw → bid again works |
| ☐ | E6 (EARN-01/02/05) | Earnings: unique key against duplicates; verification only succeeds if the earning is still PENDING; 409 when already decided; demo mode gets the same checks. | Two verifiers at once; double-click submit | Parallel verify → one 200, one 409 |
| ☐ | E7 (ALLOC-05) | The SLA deadline is set at allocation (from D6), never in the past. | Allocated after the client's due date (staff must pick a new date) | Deadline is after allocation time |
| ☐ | E9 | Dates use the institution's timezone from Settings (`joinedAt`, end-of-day deadlines). | UTC vs IST around midnight | 23:30 IST counts as the same day |
| ☐ | SYS-10 | Add a `RequirePermission` guard to the `/earnings` page (found during Phase 1 testing). | Analyst typing the URL | Screenshot as analyst shows the "no access" state |
| ☐ | E11 | "Demo data mode, changes won't be saved" banner in the web app. | Mode switching while the page is open | Banner shows when `/health` says mock |

---

## Phase 3: New look (UMS-inspired, our own brand)

Goal: feels familiar to LPU students and looks cleaner than UMS. Every card shows real data and has a working action. **Doc:** `docs/modules/ui-shell.md` (plus updates to `component-tree.md` and CLAUDE.md "Frontend building blocks").

| ☐ | ID | Change | Edge cases handled |
|---|---|---|---|
| ☐ | U1 | Fonts through `next/font`: one body font and a monospace font for numbers. | Font fails to load (system fallback); Hindi or other characters in names |
| ☐ | U2 | Design tokens as CSS variables (colours, radius, shadow); Tailwind reads them. | Old hex codes keep working during the switch |
| ☐ | U3 | **Orange icon rail** (collapsible, choice saved in `user.preferences`), built from `navigationFor(role)`. | Role with few links; collapsed rail plus tooltips; keyboard navigation |
| ☐ | U4 | **Top bar:** logo, menus with dropdowns, search, bell, identity block (name, registration number, program and year, `TierBadge`). | Staff without a registration number; very long names; no photo |
| ☐ | U5 | **Notice line:** the single most urgent item (overdue > at risk > deadline soon > exam blackout). | Nothing urgent (line hidden); several items equally urgent |
| ☐ | U6 | **Quick links row** with red counts from `useWorkQueue()`. | Count over 99 ("99+"); a link the role isn't allowed to use (hidden) |
| ☐ | U7 | New UI part **`TabCard`** (orange tab label on the card border, "View all" footer). | Long titles; empty, loading and error states built in |
| ☐ | U8 | **Student dashboard cards:** My Training, Messages, Opportunities for you, Earnings, Active Projects, Deadlines, Announcements. | **One card failing doesn't break the others**; new student with no data; Tier 4 text |
| ☐ | U9 | **Staff dashboard cards:** Sign-up requests, Earnings to verify, Bids waiting, My Messages, Announcements (At-risk projects after Phase 4). | Role without a permission sees no card for it |
| ☐ | U10 | Accessibility: readable text on orange, focus rings, status shown with text or icon as well as colour. | Colour-blind users; keyboard-only use |
| ☐ | U11 | Fix the data quirks that show up: "Hcl Amplified " (trim names), hide the fake "94% match" until F5. | Existing data with stray spaces |

**Not copied from UMS:** logos, UMS/LPU product names, text shadows, mixed button styles, cut-off cards.

---

## Phase 4: Real features behind the cards

### F1: Safeguards engine. Doc: `docs/modules/safeguards.md`
| ☐ | ID | Change | Edge cases handled |
|---|---|---|---|
| ☐ | G1 | `SAFEGUARD_RULES` in `packages/types` (like `TIER_RULES`). Limits editable by an Admin on `/settings`. | An Admin enters nonsense limits (validated ranges) |
| ☐ | G2 | Each rule worked out from data: CGPA vs required, hours used + this project's hours, number of parallel projects. **Also: `POST /hours` stores hours per week (moved here from S12).** | No academic record yet (RESTRICTED); project with no hours estimate |
| ☐ | G3 | New fields: attendance, backlogs, compliance checklist (recorded by Faculty). | Missing values (counted as "not recorded", not a pass) |
| ☐ | G4 | Exam blackouts per program and year, plus a buffer before exams. | Overlapping blackouts; a project's deadline inside a blackout |
| ☐ | G5 | Hard vs soft rules; overrides with a reason and an expiry, logged. | Expired override; overriding a hard rule (not allowed) |
| ☐ | G6 | Each failed rule says **what unlocks it**. Students see the check before bidding. | Several failing rules (all listed, most important first) |
| ☐ | G7 | Real health cards: number of students blocked or warned per rule, last time it ran. | Zero students; demo mode |

### F2: Delivery submission and milestones. Doc: `docs/modules/sla-and-delivery.md`
| ☐ | ID | Change | Edge cases handled |
|---|---|---|---|
| ☐ | F2a | Milestones created from the deliverables at allocation. The student marks each one done. | No deliverables (one milestone); marking done twice |
| ☐ | F2b | **Student submits the delivery** (link or PDF). Staff **accept** or **request a revision** (2 rounds included). | Submit after cancellation; third revision (needs coordinator approval); accept twice (409) |
| ☐ | F2c | Existing staff "confirm delivery" keeps working (additive). | Old allocations without milestones |

### F3: SLA engine. Doc: same file
| ☐ | ID | Change | Edge cases handled |
|---|---|---|---|
| ☐ | G9 | Status worked out on read: On track / At risk / Paused / Overdue / Completed on time or late. | Clock changes; a project paused and overdue at once (paused wins) |
| ☐ | G10 | Kick-off within 24 h; extension requests (D4); pause during exams or approved leave. | Extension asked after the deadline (refused); two extension requests |
| ☐ | G12 | Daily check: reminders through Messages (48 h, 24 h, at risk, overdue). An SLA event log shown as a timeline. Staff SLA board. | **The same reminder never sent twice** (sent reminders are recorded); the API restarting mid-run; demo mode |
| ☐ | G11 | Staff SLAs: sign-up approval within 2 days, verification within 5 days, bid decision before closing, replies within 1 day. Items show how long they've been waiting. | Weekends and holidays (working days) |

### F4: Real skill match score. Doc: `docs/modules/bids-and-allocation.md`
| ☐ | ID | Change | Edge cases handled |
|---|---|---|---|
| ☐ | F4 | Match = how many of the opportunity's skills the student has, plus a bonus for completed related training. Shown as "4 of 5 skills". | Student with no skills ("Add skills to see your match"); case and spelling differences ("React" vs "react.js") |

---

## Phase 5: Polish

| ☐ | ID | Change |
|---|---|---|
| ☐ | P1 | Mobile: bottom tab bar for students; tables become cards. |
| ☐ | P2 | Empty states with line art, skeletons that match the layout, errors with Retry on every page. |
| ☐ | P3 | Command bar (Ctrl+K) finds real records and actions; go-to shortcuts. |
| ☐ | P4 | Opportunities list with a side panel, filter chips, bookmarks. Earnings as receipts with a status timeline; staff quick review mode with Undo. |
| ☐ | P5 | Dark mode (cheap after U2). |

---

## Phase 6: Trust features (if time allows)

| ☐ | ID | Change | Key edge cases |
|---|---|---|---|
| ☐ | T1 | Client feedback through a one-time link. | Link used twice; expired link; guessing links (long random tokens) |
| ☐ | T2 | Delivery certificate PDF with a public `/verify/<code>` page (no amounts). | Revoked certificate; work that was reassigned |
| ☐ | T3 | Skills backed by evidence vs skills a student only claims. | Skill removed after an endorsement |
| ☐ | T4 | Yearly statement of the student's own verified earnings. | Year with no earnings; mixed currencies |
| ☐ | T5 | Institution report export (aggregate only). | Small groups that could identify one student (hide groups under 5) |
| ☐ | T6 | Audit log of important staff actions (Admin can view). | The log itself can't be edited |
| ☐ | T7 | "How allocation works" page for students. | n/a |

---

## 9. Doc map: what each phase writes

| Phase | Creates | Updates |
|---|---|---|
| 1 | `modules/security.md` | `edge-cases.md`, `architecture.md`, CLAUDE.md (env vars) |
| 2 | `modules/bids-and-allocation.md` | `edge-cases.md`, `data-model.md`, `access-control.md` |
| 3 | `modules/ui-shell.md` | `component-tree.md`, CLAUDE.md (building blocks) |
| 4 | `modules/safeguards.md`, `modules/sla-and-delivery.md` | `edge-cases.md`, `data-model.md`, `access-control.md` |
| 5 | n/a | `modules/ui-shell.md` |
| 6 | `modules/trust.md` | `access-control.md`, `data-model.md` |

Every phase also ticks its boxes here and in `edge-cases.md`.
