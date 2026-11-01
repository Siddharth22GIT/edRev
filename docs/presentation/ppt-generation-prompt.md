# Prompt: generate a feature-showcase deck for REVALANCHE / EduRev

Paste everything below the line into an AI slide tool (Gamma, Copilot in PowerPoint, Canva Magic Design, ChatGPT/Claude with a PPTX skill, etc.). It is self-contained: the tool needs no access to the code.

---

## Your task

Create a 16:9 presentation (about 30 slides) that showcases **REVALANCHE (product name: EduRev)**, a college operations workspace. The audience is faculty, college administrators and project evaluators: technical enough to follow an architecture diagram, but the deck must also work for non-developers. **Use a diagram on almost every slide**: flowcharts, swimlanes, state machines, a sequence diagram, a hub-and-spoke, a staircase, a matrix, a timeline and two native charts. Avoid plain bullet slides. Draw diagrams as editable shapes (not screenshots) wherever the tool allows; Mermaid code is given where it helps.

## Design

- Palette from the product: orange `#F2A65A` (dark text variant `#C27803`, light tint `#FEF6EE`), blue `#3978B8` (dark `#204D7D`, light tint `#EFF6FC`), charcoal text `#30343B`, muted text `#666D7A`, page `#F7F7F6`, borders `#E6E6E6`. Green `#2F9E6B` for success/verified, red `#D1495B` for errors/rejected.
- Title, section-divider and closing slides: dark diagonal gradient `#30343B → #2B3F58 → #204D7D` with a stylised mountain silhouette and an orange rising arrow (the logo motif: mountains + a rising line). Content slides: white.
- Font: Calibri (bold titles ~34 pt, left-aligned; body 14–16 pt; captions 11–12 pt).
- Visual motif: icons in small orange or blue circles, rounded cards with a soft shadow. Orange = student actions, blue = staff actions. No decorative stripes or underlines.
- Add speaker notes to every slide (2–3 sentences explaining the diagram).

## Product facts (use these; don't invent features)

- Students train, bid on curated client work, get allocated (subject to academic safeguards), deliver, and record freelance earnings that staff verify. The institution sees aggregate reporting only.
- Monorepo (npm workspaces): `apps/web` (Next.js 15 App Router, React 19, Tailwind 3), `apps/api` (Express 5 + Mongoose, layers routes → middleware → controllers → services → models), `packages/types` (domain types + the single permission map + tier rules), `packages/mock-data` (seeds MongoDB, is the API fallback "demo data mode", and the web app's offline first render).
- Numbers: 9 roles, 21 named permissions, 60+ API endpoints, 16 screens, 4 tiers, 5 safeguard checks, 149 automated API tests across 10 suites, 2 data modes (MongoDB live + in-memory demo).
- Roles: Student, Bid Desk Analyst, Proposal Editor, Guild Lead, Cell Coordinator, Faculty Director, Placement Office, Dean, Administrator.
- Hard rules: no platform passwords/API keys/tokens stored (identifiers and portfolio links only); the institution takes 0% commission and has no payment gateway; no individual earnings leaderboard; only an Administrator changes official tiers (automation only suggests); a student's identity always comes from the verified login token, never the request body; the official CGPA comes from the academic record, and a student-entered CGPA is only a claim.

## Slide-by-slide outline

**Section 0: Introduction**

1. **Title.** "REVALANCHE". Subtitle: "EduRev: one college workspace that takes students from training to verified client work, with academic safeguards built in". A chip row: Train › Bid › Deliver › Verify › Report.
2. **Why EduRev exists.** Two cards with an arrow between them. *Without a system* (red ✗ icons): scattered training/CGPA sheets; no fair, auditable way to hand out client work; freelance work clashing with exams; unverifiable earnings and privacy risk. *With EduRev* (green ✓): one workspace with an official academic record and tiers; a bid desk with one atomic winner and recorded reasons; academic safeguards; staff-verified earnings, aggregate reports, 0% commission.
3. **The platform at a glance.** 8 stat tiles (big number + icon + label) using the numbers above.
4. **The student journey.** A rising path of 8 icon circles (orange = student, blue = staff): Sign up (Student) → Approval (Coordinator/Admin) → Onboarding (Student) → Train & climb tiers (Admin sets the tier) → Bid (Student) → Allocation (Analyst/Coordinator) → Delivery (Student; staff confirm) → Earnings verified (verifier roles). Bottom band: "Staff see aggregate analytics at every stage, never an individual leaderboard."

**Section 1: Architecture & access**

5. Section divider.
6. **System architecture** (layered block diagram): Browser → `apps/web` container (AuthProvider → AuthGate; AppShell with sidebar, top bar, Ctrl+K; client-component screens; `useApi()` attaches the Bearer token and handles 401) → "JSON + JWT" → `apps/api` container (Routes; Middleware: auth, permission, rate limits; Controllers: input + student scoping; Services: business rules) → MongoDB (cylinder), plus a dashed arrow "if DB is down" to *Demo data (in-memory, dev/test only)*. Below: shared packages `@edurev/types` and `@edurev/mock-data` with arrows up to both apps.
7. **Every request passes through layers** (snake pipeline). Row 1, app-wide: Request → helmet (security headers) → Error sanitiser (no DB internals in replies) → Body limits (100 KB default, 413) → Database guard (production without DB → 503). Row 2, per route, right to left: authenticate (JWT + session version → 401) → requirePermission (403) → limitPerUser (write routes, 429) → Controller + service (real-file checks, rules) → jsonErrorHandler (always `{ message }`) → Response (`{ data }` or `{ message }`).
8. **Data model** (entity diagram with Student as the highlighted hub). Linked to Student: User (login, role, tokenVersion; created from a SignupRequest), AcademicSnapshot (official CGPA, compliance), TrainingModule, TierSuggestion, EarningsEntry (amount, FX rate, proof, status), PlatformAccount (identifier only), HourLog (weekly hours vs cap), Conversation (threads, messages, read state). Bid links Student ↔ Opportunity (unique per opportunity + student). Allocation links Opportunity, the chosen Bid and Student (winner, agreed deadline, reassignment history). Standalone: Settings, BlackoutPeriod, Proposal.
9. **Nine roles, one permission map** (dot matrix, roles as columns, permissions as rows; large dot = allowed). Rows → allowed roles: Publish opportunity → Analyst, Coordinator, Admin · Allocate work → Analyst, Coordinator, Admin · Reassign allocation → Coordinator, Admin · Direct-assign a non-bidder → Admin · Submit a bid → Student · Review all bids → all staff · View any student record → all staff · Supervise training & hours → Guild lead, Coordinator, Faculty, Admin · Change official tier → Admin · Override hour cap → Coordinator, Faculty, Admin · Record official CGPA → Faculty, Admin · Submit earnings → Student · View all earnings → Coordinator, Faculty, Placement, Dean, Admin · Verify earnings → Coordinator, Faculty, Dean, Admin · Approve sign-ups → Coordinator, Admin · Message students → Guild lead, Coordinator, Faculty, Dean, Admin · Broadcast to everyone → Coordinator, Admin · Institution settings → Admin · Analytics → all staff. Side notes: defined once in `PERMISSIONS`; the API enforces it with `requirePermission`; the UI uses `can(role, permission)`; students see only their own data.

**Section 2: Student lifecycle**

10. Section divider.
11. **From sign-up to an approved student** (3-lane swimlane: Student / Coordinator-Admin / Faculty Director). Sign up with an `@lpu.in` email + registration number → PENDING_APPROVAL → Review request (approve or reject) → Account created: STUDENT, TIER_1, RESTRICTED academic record → branches to *Onboarding wizard* (student lane) and *Official CGPA recorded* (faculty lane: unlocks safeguards and tier rules). Note: one account per email and per registration number.
12. **First-login onboarding wizard** (horizontal stepper with 6 nodes and a card under each): Welcome → Photo (optional, real image checked) → Skills & interests (at least one each; skills drive matching) → Academics & hours (claimed CGPA, weekly hours) → Goals & portfolio (public links only) → Dashboard (skip allowed and remembered). Callouts: students are redirected here until they finish or skip; the claimed CGPA is only a claim.
13. **Four tiers, climbed in order** (staircase of 4 rising blocks: grey → blue → orange → dark). Tier 1 Starter: every new student starts here. Tier 2 Skilled: official CGPA ≥ 8.0, training ≥ 40%, 2+ skills. Tier 3 Advanced: CGPA ≥ 9.0, training ≥ 60%, 3+ skills. Tier 4 Elite: from Tier 3, 5+ confirmed deliveries, 90%+ on time. Callout: "Rules suggest; an Administrator decides."
14. **Tier suggestions: automation proposes** (flow): 4 inputs (official CGPA, training %, skills, deliveries & on-time rate) → `suggestTier()` (TIER_RULES) → Pending suggestion (target tier + criteria met) → Approved (official tier changes) / Dismissed / Withdrawn (record changed, the system withdraws it). Footer chips: reads the official CGPA only; never suggests moving down; Tier 4 only through on-time delivery.

**Section 3: Bids, allocation & delivery**

15. Section divider.
16. **Placing a bid: five gates** (gate flow, each with a red reject branch): 1 Valid input (amount > 0, text limits, real PDF) → 400 · 2 Opportunity exists → 404 · 3 Bidding open (OPEN/UNDER_REVIEW, before the close date) → 409 · 4 Official tier ≥ required → 403 · 5 One bid each (unique index) → 409 · ✓ Bid saved (201 + warnings; count +1 in one update; OPEN → UNDER_REVIEW). Cards below: Edit (while SUBMITTED and open), Withdraw (before allocation; re-bid revives the record), Fair use (30 bids/hour; a double-click gets one 201 and one 409).
17. **Status lifecycles** (three state machines):
    ```mermaid
    stateDiagram-v2
      state Opportunity { OPEN --> UNDER_REVIEW: first bid
        UNDER_REVIEW --> OPEN: last bid withdrawn
        UNDER_REVIEW --> ALLOCATED: allocate }
      state Bid { SUBMITTED --> B_ALLOCATED: chosen
        SUBMITTED --> REJECTED: another student won / reassigned away
        SUBMITTED --> WITHDRAWN: student withdrew
        WITHDRAWN --> SUBMITTED: bid again (same record) }
      state Allocation { A_ALLOCATED --> COMPLETED: delivery confirmed }
    ```
    Note: Reassign keeps the allocation ALLOCATED and adds a history entry with the reason. CLOSED opportunities take no bids.
18. **Allocation: exactly one winner** (sequence diagram):
    ```mermaid
    sequenceDiagram
      participant A as Analyst A
      participant B as Analyst B
      participant API
      participant DB as MongoDB
      participant O as Other bidders
      A->>API: allocate(student X)
      B->>API: allocate(student Y)
      API->>DB: claim: status OPEN/UNDER_REVIEW → ALLOCATED
      DB-->>API: matched (X wins)
      API->>DB: same claim for Y
      DB-->>API: no match
      API->>B: 409 · already allocated, use Reassign
      API->>DB: save allocation, other bids → REJECTED
      API->>A: 200 · allocation + agreed deadline
      API->>O: message "Bid update"
    ```
    Footer: checked first (a live bid and every safeguard); a failed allocation write undoes the claim; changing the winner later = Reassign with a reason (Coordinator/Admin); only an Admin can direct-assign a non-bidder, with a reason.
19. **Academic safeguards** (hub and spoke): centre "Allocation request" with 5 spokes: Tier requirement, Official CGPA, Weekly hour cap, Exam blackout, Compliance. Right side: green "All pass → continue to the atomic claim"; red "Any fails → blocked (400) with every reason listed" (e.g. "Weekly work-hour limit reached.", "Exam blackout is active."); blue "Hour-cap override: Faculty Director, Coordinator or Admin, with a stored reason". Re-checked at allocation and at every reassignment.
20. **Agreed deadlines and on-time delivery.** Decision cascade: Staff chose a future date? → use it; else client deadline still ahead? → use it; else opportunity SLA date ahead? → use it; else now + 7 days (never in the past; institution timezone). Right: mini timeline showing "on time = delivered by the later of the agreed deadline and the client's due date"; staff confirm delivery → Allocation COMPLETED; feeds Tier 4 (5+ deliveries, 90%+ on time).

**Section 4: Earnings, messages & analytics**

21. Section divider.
22. **Earnings: recorded by students, verified by staff** (flow): Student records an earning (platform, amount, currency, FX rate, screenshot proof) → PENDING → Verifier (Faculty, Coordinator, Dean, Admin) → VERIFIED / REJECTED. One decision only (a second gets 409). Four principle cards: 0% commission · No credentials · FX rate kept (e.g. 100 USD × 83.2 = ₹8,320) · No duplicates (same student + platform + amount + date only once).
23. **Messages: staff reach out, students reply** (branching diagram): Staff sender → *Selected students* (one private DIRECT thread each) or *a tier, a program, or everyone* (one ANNOUNCEMENT, recipients snapshotted; "everyone" is Coordinator/Admin only) → Student inbox (bell + unread badge, refreshed every 30 s). A dashed return arrow: students only reply, and a reply to an announcement opens one private thread with the sender. Side cards: per-reader read state, 30-second refresh, 60 messages per 10 minutes rate limit.
24. **Aggregate-only analytics.** Native column chart "Students by tier" (demo data: Tier 1 = 24, Tier 2 = 61, Tier 3 = 32, Tier 4 = 11; bars coloured grey/blue/orange/dark) + 4 KPI tiles (placement rate 72%, proposal win rate 38%, average response 18 h, learner satisfaction 4.7). Label: "Sample figures from the demo dataset". Note: no individual earnings leaderboard; analytics hidden from students.

**Section 5: Quality & roadmap**

25. Section divider.
26. **Security hardening (Phase 1).** 2 × 5 icon cards: Strong secrets (production needs a 32+ char JWT secret) · Short sessions (1-day tokens; password change ends other sessions) · Real-file checks (PDF/images verified by bytes) · Body limits · Per-user rate limits (fair on shared campus Wi-Fi) · Clean errors (no DB internals) · Security headers (helmet + CSP) · No demo mode in production (no DB → refuse to start; DB drops → 503) · No credentials stored · Patched packages (8 of 11 audit findings fixed, 3 reviewed and accepted).
27. **Resilient by design: demo data mode** (flowchart with diamonds): API starts → MongoDB reachable? yes → Live mode (persisted; seeded on first start). no → Production? yes → refuse to start (503 if the DB drops later); no → Demo data mode (in-memory data, startup banner, "Demo data mode" badge in the top bar, `/api/health` says `db: "mock"`). Side note: `ALLOW_DEMO_MODE=true` opts in deliberately for classroom demos.
28. **Tested in both data modes.** Native horizontal bar chart "API tests per suite": Earnings 25, Access control 24, Bids & allocation 19, Sign-up 16, Security 15, Messages 14, Tiers & delivery 12, Account settings 8, Onboarding 8, Profile 8 (total 149). Callout "149". Checklist "Definition of done": typecheck every workspace, `npm test` against MongoDB, `test:mock` in demo mode, web production build, screenshots as student and staff, module docs and edge cases updated.
29. **Technology stack** (4 layered rows of chips): Frontend: Next.js 15 App Router, React 19, Tailwind CSS 3, TypeScript · Backend: Node.js, Express 5, Mongoose, JWT auth, helmet · Data: MongoDB, in-memory demo data, validated data-URL uploads · Shared & tooling: npm workspaces, @edurev/types, @edurev/mock-data, node:test.
30. **Roadmap** (horizontal timeline, done = filled orange ✓, planned = hollow blue, a "Now" marker): Done: Core build (persistence, RBAC, bid desk, tiers, earnings, analytics) → Profile & settings → Onboarding & self sign-up → Messages → Phases 1–2 (security; bid and allocation integrity, 30 Oct 2026). Next: Phase 3 new look (icon rail, top bar, dashboard cards, accessibility) → Phase 4 safeguards + SLA engine (hour caps, attendance, parallel projects per tier, extensions, cool-down; 5 decisions needed first) → Phases 5–6 (mobile, Ctrl+K, dark mode; client feedback links, delivery certificates, audit log).

**Close**

31. **Principles we never break** (dark slide, 6 translucent cards): No commission · No credentials · No leaderboards · Admins set tiers · Identity from the token · Official CGPA wins. Then "Thank you: questions and live demo" with the logo.

## Quality bar

- Every slide has one clear message in its subtitle and a visual (diagram, chart, icon grid or stat tiles).
- Text never overflows its shape; keep body text ≥ 14 pt and captions ≥ 10 pt; split a slide rather than shrink text.
- Keep titles in the same position on every content slide, and charts styled identically.
- Don't add features, numbers or logos that are not listed above (in particular, no LPU or UMS logos).
