# Bids and allocation (Phase 2)

Built 30 Oct 2026. Plan: [improvement-plan.md](../improvement-plan.md) Phase 2. Edge-case IDs: [edge-cases.md](../edge-cases.md).

## 1. What it does

Students bid on client work; staff pick one bid and allocate the work; the student delivers. Phase 2 makes this safe when several people act at once (no double allocation, no lost bid counts, no double decisions on earnings), adds what was missing (edit, withdraw, reassign, "you weren't selected" messages, a bidding close date), and fixes deadlines and dates (SLA never starts overdue; dates follow the institution's timezone).

## 2. Flow

### Student

```
Open an opportunity
  │
  ├─ bidding closed? ────────── allocated, closed, or past bidsCloseAt → message, no form
  ├─ already have a live bid? ─ "Your bid" card: status + Edit / Withdraw
  └─ otherwise ─────────────── bid form
        │
        ▼
POST /opportunities/:id/bids
  1. fields valid? (amount > 0, text lengths, real PDF)          no → 400
  2. opportunity exists?                                        no → 404
  3. still open? (OPEN / UNDER_REVIEW, before bidsCloseAt)      no → 409
  4. student's official tier ≥ required tier?                   no → 403
  5. already bid? (WITHDRAWN = may bid again, same record)      yes → 409
  6. save bid → $inc bid count → OPEN becomes UNDER_REVIEW
  7. reply 201 { data: bid, warnings: [...] }   (above budget, would be blocked by a safeguard)

Edit:      PATCH /opportunities/:id/bids/mine            (only while SUBMITTED and open)
Withdraw:  POST  /opportunities/:id/bids/mine/withdraw   (SUBMITTED or SHORTLISTED)
```

### Staff

```
POST /opportunities/:id/allocate { studentId, reason?, slaDeadline? }
  1. opportunity open?                       no → 409 ("use Reassign")
  2. student has a live bid?                 no → 400 (Administrator: allowed with a reason, "direct assignment")
  3. safeguards pass?                        no → 400 with reasons
  4. CLAIM: update opportunity WHERE status in (OPEN, UNDER_REVIEW) → ALLOCATED
        nothing matched → someone else won → 409
  5. create the Allocation (unique per opportunity) with the agreed deadline
  6. chosen bid → ALLOCATED; every other live bid → REJECTED
  7. message each rejected student ("Bid update: …")

POST /opportunities/:id/reassign { studentId, reason, slaDeadline? }   (Coordinator, Administrator)
  allocation exists, not delivered/cancelled → swap student atomically → history entry → old bid REJECTED,
  new bid ALLOCATED → message the previous student ("Allocation update: …")
```

### Status lifecycles

```
Opportunity:  OPEN ⇄ UNDER_REVIEW ──allocate──► ALLOCATED            (CLOSED: no bids)
              (back to OPEN only when the last live bid is withdrawn; never backwards from ALLOCATED)
Bid:          SUBMITTED ──► ALLOCATED
                  │   └───► REJECTED   (another student got the work, or reassigned away)
                  └───────► WITHDRAWN ──bid again──► SUBMITTED (same record)
Allocation:   ALLOCATED ──► COMPLETED    (reassignments keep it ALLOCATED and add history)
```

## 3. Rules

| Rule | Detail |
|---|---|
| Bidding window | Only `OPEN` / `UNDER_REVIEW`, and before `bidsCloseAt` if set (date-only = end of that day, institution timezone). Not tied to the client `deadline`: the seeded demo opportunities have September deadlines and must stay usable. |
| Tier | Official tier ≥ required tier, checked at bid time (403) and again through safeguards at allocation. |
| One bid per student | Unique index `(opportunityId, studentId)`. A withdrawn bid is revived in place when the student bids again. |
| Edit | Only while `SUBMITTED` and bidding is open. A new PDF replaces the old one; no PDF = keep the old one. |
| Withdraw | `SUBMITTED` or `SHORTLISTED`. Not after allocation (ask the coordinator). |
| Allocation | One winner, decided by an atomic claim. All other live bids become `REJECTED` and get a message. |
| Who can receive work (D7) | A student with a live bid. An Administrator may assign anyone with a reason (≥ 5 characters), stored as `directAssignmentReason`. |
| Reassign (E1b) | Coordinator or Administrator, with a reason. Target must have a non-withdrawn bid (a rejected bidder is fine), pass safeguards, and differ from the current student. Not after delivery. |
| Agreed deadline (E7) | Staff's `slaDeadline` if given (must be in the future), else the client's `deadline` if still ahead, else the opportunity's `slaDeadline` if ahead, else **now + 7 days**. Never in the past. |
| On time (D6) | Delivered by the later of the allocation's agreed deadline and the client's due date. (Never stricter than the client; older allocations whose SLA date was an automatic default aren't penalised.) |
| Dates (E9) | Date-only values end at 23:59:59.999 in the institution's timezone (Settings → timezone, default `Asia/Kolkata`). New students' `joinedAt` uses the local date. |
| Earnings (E6) | Same student + platform + amount + date only once (unique index). A decision (verify/reject) only applies while `PENDING`, in one update; a second decision → 409. |

## 4. Data (all additive)

| Collection / type | Field | Purpose |
|---|---|---|
| `opportunities` | `bidsCloseAt?` (**new**) | When bidding closes. |
| `bids` | `editedAt?`, `withdrawnAt?` (**new**) | When the student last edited / withdrew. |
| `bids` | `id` format | Now `bid-<uuid>` for new bids (old ids unchanged). |
| `allocations` | `reassignments?[]` (**new**) | `{ fromStudentId, toStudentId, by, at, reason }`, oldest first. |
| `allocations` | `directAssignmentReason?` (**new**) | Set when an Administrator assigned a non-bidder. |
| `earningsentries` | unique index (**new**) | `{ studentId, platformName, originalAmount, earningDate }`. Checked: no existing duplicates. |
| `PERMISSIONS` | `ALLOCATION_REASSIGN` (**new**) | Cell Coordinator, Administrator. |
| `PERMISSIONS` | `ALLOCATION_DIRECT_ASSIGN` (**new**) | Administrator. |

## 5. API

| Endpoint | Permission | Request → response | Errors |
|---|---|---|---|
| `POST /opportunities` | `OPPORTUNITY_CREATE` | + optional `bidsCloseAt`. Text fields are trimmed. | 400 bad date |
| `POST /opportunities/:id/bids` | `BID_SUBMIT` | → `201 { data: bid, warnings: string[] }` (`warnings` is new, additive) | 400 · 403 tier · 404 · 409 closed / already bid · 429 |
| `PATCH /opportunities/:id/bids/mine` (**new**) | `BID_SUBMIT` | any of `proposedAmount, estimatedCompletionTime, message, relevantSkills, proposalPdfUrl, proposalPdfName, removeProposal` → `{ data: bid, warnings }` | 400 · 404 no bid · 409 not editable / closed |
| `POST /opportunities/:id/bids/mine/withdraw` (**new**) | `BID_SUBMIT` | → `{ data: bid }` | 404 · 409 allocated / already withdrawn |
| `POST /opportunities/:id/allocate` | `OPPORTUNITY_ALLOCATE` | `{ studentId, reason?, slaDeadline? }` → `{ data: allocation }` | 400 no bid / safeguards / past date · 404 · 409 already allocated or lost the race |
| `POST /opportunities/:id/reassign` (**new**) | `ALLOCATION_REASSIGN` | `{ studentId, reason, slaDeadline? }` → `{ data: allocation }` | 400 reason / same student / safeguards · 404 · 409 delivered / changed meanwhile |
| `PATCH /earnings/:id/verify` | `EARNINGS_VERIFY` | unchanged | **409** (was 400) when already decided |
| `POST /earnings` | `EARNINGS_SUBMIT` | unchanged | 409 also for a duplicate that raced past the check |

## 6. Edge cases

| ID | What can happen | How we handle it |
|---|---|---|
| ALLOC-01 | Two staff allocate different students at the same moment | Atomic claim on the opportunity: exactly one succeeds, the other gets a friendly 409. Bids change only after the claim. |
| ALLOC-02 | Out-of-date page allocates already-allocated or delivered work | 409 "already allocated. Use Reassign". No silent overwrite. |
| ALLOC-03 | Allocating a student who never bid | 400, unless an Administrator gives a reason (direct assignment, recorded). |
| ALLOC-04 | Student became ineligible after bidding | Safeguards re-checked at allocation and reassignment (400 with reasons). |
| ALLOC-05 | The client's due date already passed at allocation | Agreed deadline falls back to now + 7 days; staff may choose a future date; a past date is refused. |
| ALLOC-06 | Allocation record write fails after the claim | The claim is undone (opportunity status restored), then 409/500. |
| BID-01 | Two bids at once lose a count | `$inc` in one database update. |
| BID-02 | Two bids in the same millisecond got the same id | `randomUUID()`. "Already bid" only when the clash is on (opportunity, student). |
| BID-03 | Double-click or two tabs | Unique index: one 201, one 409. |
| BID-04 | Bid on allocated or closed work; a bid flipping ALLOCATED back to UNDER_REVIEW | 409; status only moves OPEN → UNDER_REVIEW. |
| BID-05 | Bid after the close date | 409 "Bidding closed on …". |
| BID-06 | Bid above the student's tier | 403 with both tiers named. |
| BID-07 | Student currently blocked by a safeguard | Bid accepted with a warning; the hard check is at allocation. |
| BID-08 | Amount `"abc"`, `-5`, `0`, huge text | 400. Above budget: accepted with a warning. |
| BID-10 | Edit or withdraw; bid again after withdrawing | Edit while SUBMITTED; withdraw while SUBMITTED/SHORTLISTED; bidding again revives the same record (unique index stays). Bid count goes down and up. |
| BID-10b | Last live bid withdrawn | Opportunity goes back to OPEN. |
| BID-11 | Students who weren't picked | Bid → REJECTED and a private message. Message failures are logged and never undo the allocation. |
| E1b-a | Reassign delivered work | 409. |
| E1b-b | Two reassignments at once | Atomic on the current student: the second gets 409. |
| E1b-c | Reassign to the same student, without a reason, or to someone who withdrew | 400 / 400 / 409 (Administrator may assign directly with a reason). |
| EARN-01 | Same earning submitted twice at once | Unique index: one 201, one 409. |
| EARN-02 | Two verifiers decide at once | Conditional update on `PENDING`: one 200, one 409. |
| E9-a | 00:30 in India is still "yesterday" in UTC | `joinedAt` and date-only deadlines use the institution's timezone. |
| E9-b | Timezone missing or invalid in Settings | Falls back to `Asia/Kolkata`. |
| DEMO | Demo data mode | Same rules; JavaScript runs one request step at a time, so check-and-set is atomic there. Demo-data hour logs can be missing: bid-time warnings skip the safeguard check instead of failing. |

## 7. Tests

`apps/api/src/tests/bids-allocation.test.ts`: 19 tests, both modes, temporary students/opportunities (`P2T`), all cleaned up.

| Test | Proves |
|---|---|
| ACL | New endpoints: 401 without login; staff can't use `/bids/mine`; students, analysts and faculty can't reassign. |
| E2 / BID-04, BID-05 | 409 on allocated, closed and past-close work; status stays ALLOCATED. |
| E4 / BID-06, BID-08 | Tier 403; bad amounts 400; above budget 201 with a warning. |
| E3 (2 tests) | 5 simultaneous bids → count 5, UUID ids; same student twice at once → one 201, one 409. |
| E5 (2 tests) | Edit; withdraw → count −1 → 409 on second withdraw → bid again revives the same id. |
| E1 / ALLOC-01 | Two allocations at once → one 200, one friendly 409; one ALLOCATED bid, four REJECTED. |
| BID-11 | A rejected student has the "Bid update" message; the winner doesn't. |
| ALLOC-02 | Allocating again → 409, winner unchanged. |
| E7 / D7 | Past `slaDeadline` → 400; non-bidder → 400; Administrator with a reason → 200 and deadline ≈ 7 days ahead. |
| E1b (2 tests) | Reason/same-student checks; reassign → history, bids swapped, previous student messaged; allocated student can't withdraw; delivered work can't be reassigned. |
| E6 (2 tests) | Parallel duplicate earnings → 201 + 409; parallel decisions → 200 + 409. |
| E9 | End of day in Asia/Kolkata = 18:29:59.999 UTC; 01:30 IST is the next date. |

Also updated: `earnings.test.ts` expects 409 (not 400) for a second decision.

## 8. How to change it safely

| To change… | Edit | Watch out for |
|---|---|---|
| Who may reassign or assign directly | `PERMISSIONS` in `packages/types/src/permissions.ts` | The UI reads the same map (`can(role, …)`). |
| The fallback delivery window (7 days) | `agreedDeadline` in `opportunity.service.ts` | Also update this doc. |
| The "you weren't selected" text | `allocateOpportunityService` / `reassignAllocationService` | Subjects start with `Bid update:` / `Allocation update:` (tests clean up by prefix). |
| Bid field limits | `parseBidChanges` in `opportunity.controller.ts` | Keep the web form's hints in step. |
| What "on time" means | `isOnTime` in `delivery.service.ts` | It feeds the TIER_4 rule (90%+ on time). |
| Anything that changes bid or allocation status | Use a conditional update (`findOneAndUpdate({ …, status: expected })`) | Never read-then-save for status changes. |

## Technologies used

| Technology | Used for |
|---|---|
| **MongoDB conditional updates** (`findOneAndUpdate` with a status filter) | Atomic claim on allocation, reassignment, bid edit/withdraw, earning decisions |
| **MongoDB `$inc`** | Bid counts without lost updates |
| **MongoDB unique indexes** | One bid per student; one earning per (student, platform, amount, date); one allocation per opportunity |
| **Node `crypto.randomUUID()`** | Collision-free bid ids |
| **`Intl.DateTimeFormat`** (built into Node) | Institution-timezone dates without extra libraries (`utils/time.ts`) |
| **Existing Messages service** | "Bid update" / "Allocation update" notifications |
| **React state in `BidDesk`** | "Your bid" card, edit mode, withdraw confirmation, reassign reason box |
| **`RequirePermission` (`alsoAllow`)** | Earnings page guard (SYS-10) |
| **Node test runner** | `bids-allocation.test.ts` (parallel requests via `Promise.all`) |

## Also in Phase 2

- **SYS-10:** `/earnings` now has a page guard (`EARNINGS_SUBMIT` or `EARNINGS_VIEW_ALL`), matching the sidebar and the API.
- **E11:** the existing "Demo data mode" badge now re-checks every minute and says "changes won't be saved" on wide screens.
- **U11 (part):** new opportunities have their text trimmed ("Hcl Amplified " can't happen again; existing records are unchanged).
