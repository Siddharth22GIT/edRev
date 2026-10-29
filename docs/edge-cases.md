# Edge cases: how we handle them

A study guide to what can go wrong in REVALANCHE and how the code deals with it.
Last checked against the code: 30 Oct 2026 (updated after Phase 1, security: see [modules/security.md](modules/security.md)).

**Status key:** ✅ handled · ⚠️ partly handled · ❌ not handled yet (planned fix given)

Each case has an ID (for example `BID-03`). When you fix one, mention its ID in a code comment and in the test name, and update its row here.

---

## 1. The five patterns we use everywhere

Almost every edge case is solved with one of these. Learn these first.

| # | Pattern | What it means | Example in the code |
|---|---|---|---|
| P1 | **Identity from the token** | Who you are comes from the login token, never from the request body. | `submitBidHandler` uses `req.user.studentId` |
| P2 | **Database unique index = final guard** | A "check first" in code can lose a race. A unique index can't: the database rejects the second write. | One bid per student per opportunity: `bidSchema.index({ opportunityId, studentId }, { unique: true })` |
| P3 | **Atomic conditional update** | Change a record *only if* it is still in the expected state, in one database call: `updateOne({ id, status: "PENDING" }, …)`. If 0 records changed, someone got there first → 409. | Planned for allocation and earning verification |
| P4 | **State checks (state machine)** | Each record has a status. Only some moves are allowed (`PENDING → VERIFIED` yes, `VERIFIED → VERIFIED` no). | Earnings, sign-ups, tier suggestions, delivery |
| P5 | **Clear error codes** | `400` bad input · `401` not logged in · `403` not allowed · `404` not found · `409` conflict (already done / someone else did it) · `429` too many tries · `503` needs the database | All controllers, as `{ message }` |

**Check then write vs. atomic:**

```
Check then write (can race):            Atomic (safe):
  1. find record, status is PENDING      1. updateOne({ id, status: "PENDING" },
  2. ...another request does the same...      { status: "VERIFIED" })
  3. save VERIFIED  ← both succeed!       2. modifiedCount === 0 → 409
```

---

## 2. Bid system: the flow

### Student side

```
Browse opportunities
   │  sees only work it can see; "matches your tier" hint
   ▼
Open an opportunity ──► form hidden if: already bid · already allocated
   │
   ▼
Fill the bid form
   amount · estimated time · message · relevant skills · optional PDF (≤ 10 MB)
   │
   ▼
POST /api/opportunities/:id/bids          (needs BID_SUBMIT)
   │  1. student id taken from token (P1)
   │  2. required fields present?            no → 400
   │  3. opportunity exists?                 no → 404
   │  4. already bid? (check + unique index) yes → 409
   │  5. save bid as SUBMITTED, bid count +1, opportunity → UNDER_REVIEW
   ▼
201 { data: bid }  →  student sees "Bid submitted"
```

### Staff side (Bid Desk)

```
Open opportunity → see all bids (BID_REVIEW) → read proposal PDF
   │
   ▼
POST /api/opportunities/:id/allocate { studentId }   (needs OPPORTUNITY_ALLOCATE)
   │  1. run safeguards for that student      blocked → 400 with reasons
   │  2. opportunity + student exist?         no → 404
   │  3. bid → ALLOCATED
   │  4. create (or overwrite!) the Allocation, start SLA clock
   │  5. opportunity → ALLOCATED
   ▼
Work happens → POST /:id/delivery (staff confirm) → on time or late recorded
```

### Status lifecycles

```
Opportunity:  OPEN ──first bid──► UNDER_REVIEW ──allocate──► ALLOCATED ──► CLOSED
Bid:          SUBMITTED ──► SHORTLISTED ──► ALLOCATED
                   └──────────► REJECTED / WITHDRAWN      (no endpoint sets these yet)
Allocation:   ALLOCATED ──► COMPLETED   (SLA: ACTIVE → OVERDUE / COMPLETED)
```

---

## 3. Two students bid at the same time

**Short answer: that's normal and allowed.** Bidding isn't first-come-first-served. Both bids are saved as separate records and staff pick one later. "Same time" causes only three small technical problems, and all three are on our side:

| ID | What happens | Today | Fix |
|---|---|---|---|
| BID-01 | **Bid count loses a number.** Both requests read `numberOfBids = 3`, both write `4`. Should be 5. | ❌ | Use `$inc: { numberOfBids: 1 }` (one atomic call), or count bids instead of storing the number. |
| BID-02 | **Same bid id.** The id is `bid-${Date.now()}`. Two bids in the same millisecond get the same id, the unique `id` index rejects the second one, and that student wrongly sees "You have already submitted a bid". | ❌ | Use `crypto.randomUUID()` for ids. Only show the "already bid" message when the clash is on `opportunityId + studentId`. |
| BID-03 | **The same student double-clicks**, or bids from two tabs at once. | ✅ | The button is disabled while sending. The code check plus the **unique index** (P2) mean only one bid is saved and the other gets 409. |

**The real "same time" conflict is at allocation**, when two staff allocate the same project:

| ID | What happens | Today | Fix |
|---|---|---|---|
| ALLOC-01 | Two staff click "Allocate" for **different students** at the same moment. The unique index on `Allocation.opportunityId` lets only one Allocation be created ✅, but **both bids were already marked ALLOCATED**, and the loser gets a raw database error message. | ⚠️ | Claim the opportunity first, atomically: `updateOne({ id, status: { $in: ["OPEN", "UNDER_REVIEW"] } }, { status: "ALLOCATED", allocatedStudentId })`. If 0 records changed → 409 "Already allocated to another student". Update the bids only after the claim succeeds. |
| ALLOC-02 | Staff B's page is out of date and allocates an **already allocated** (even **completed**) opportunity. The code **overwrites** the allocation with the new student. | ❌ | Same atomic claim as ALLOC-01. Changing the student on an existing allocation becomes a separate, logged "reassign" action. |

---

## 4. Other bid and allocation edge cases

| ID | Scenario | Today | Fix |
|---|---|---|---|
| BID-04 | Bidding on an opportunity that is **ALLOCATED or CLOSED** (an out-of-date page, or calling the API directly). The bid is saved **and flips the opportunity back to UNDER_REVIEW**. | ❌ | The server accepts bids only when the status is OPEN or UNDER_REVIEW (409 otherwise). Never move the opportunity's status backwards. |
| BID-05 | Bidding **after the deadline**. | ❌ | 409 "Bidding closed on {date}". |
| BID-06 | Bidding on work **above the student's tier**. Today it's only caught at allocation. | ⚠️ | Check the tier at bid time (403, with a clear reason). Show "You can bid / blocked by …" before the form. |
| BID-07 | Safeguards (exam blackout, hour cap) block the student. Today they're only checked at allocation. | ⚠️ | Check at bid time too, as a **warning** ("you'd be blocked from allocation because …"). At allocation it stays a hard block. |
| BID-08 | **Bad amount:** negative, zero, text, or far above the budget. Only "missing" is checked today. | ⚠️ | Must be a positive number. Above budget → allow, but highlight it to staff. |
| BID-09 | **Proposal file** is not a PDF, or is too large. | ✅ Phase 1 (S3) | The server checks the bytes start with `%PDF-` and the file is ≤ 10 MB (400 otherwise). Downloads take their type from the real bytes; non-PDFs never open in the browser. |
| BID-10 | A student wants to **edit or withdraw** a bid. `WITHDRAWN` exists, but there's no endpoint. | ❌ | `PATCH` (edit) and `POST …/withdraw` while the bid is still SUBMITTED. Withdrawing frees the slot, so a new bid is allowed. |
| BID-11 | **Losing bidders are never told.** Their bids stay SUBMITTED forever. | ❌ | On allocation, mark the other bids REJECTED and send each student a message ("Not selected this time"). |
| BID-12 | A student sees **another student's bid**. | ✅ | Students only get their own bid back; staff with `BID_REVIEW` see all. Proposal downloads are checked the same way (403). |
| BID-13 | Login expires while the student is filling the form. | ⚠️ | 401 is returned (sessions now last 1 day, S5). The form should keep what was typed and ask the student to log in again. |
| ALLOC-03 | Allocating to a student who **never bid**. The code checks for a bid but carries on anyway. | ⚠️ | Decide: require a bid (400), or allow it as a logged "direct assignment". |
| ALLOC-04 | The student becomes **ineligible after bidding** (CGPA dropped, blackout started). | ✅ | Safeguards are re-checked at allocation (400 with reasons). |
| ALLOC-05 | **SLA deadline already in the past** at allocation. It's copied from the opportunity, which was set when the opportunity was created, so the work is overdue on day one. | ❌ | Start the SLA when the work is allocated: deadline = allocation time + agreed duration. |
| DEL-01 | Delivery confirmed **twice**. | ✅ | 409 "already confirmed". |
| DEL-02 | Delivery date **before allocation**, or **in the future**. | ✅ | 400. |
| DEL-03 | "On time" is measured against the opportunity's `deadline`, not the allocation's `slaDeadline`. | ⚠️ | Decide which one counts. It feeds the TIER_4 "90%+ on time" rule. |

---

## 5. Edge cases in the rest of the app

### Sign-up and login
| ID | Scenario | Today |
|---|---|---|
| AUTH-01 | Email not from an allowed domain → 400. Sign-ups switched off → 403. | ✅ |
| AUTH-02 | Same email or registration number twice → 409 (unique indexes). | ✅ |
| AUTH-03 | Two staff approve the same sign-up → the second gets 409 "already approved". | ✅ (status check; make it atomic with P3) |
| AUTH-04 | Too many failed logins or sign-ups → 429, wait 15 minutes. | ✅ |
| AUTH-05 | Sign-up while the database is down (demo data mode) → 503. | ✅ |
| AUTH-06 | `joinedAt` uses the UTC date, so it can show the previous day in India. | ❌ Use the institution's timezone. |

### Earnings
| ID | Scenario | Today |
|---|---|---|
| EARN-01 | The same earning (platform + date + amount) submitted twice → 409. | ⚠️ Code check only. A fast double-click can create two. Add a unique index or an idempotency key. |
| EARN-02 | Verifying an already verified or rejected earning → 400. | ⚠️ Should be **409**. Two verifiers at once can both pass the check; use P3. |
| EARN-03 | Rejecting without a reason → 400. Amount or exchange rate ≤ 0 → 400. | ✅ |
| EARN-04 | A student views another student's earnings → 403. | ✅ |
| EARN-05 | In demo data mode, `verifyEarning` doesn't check the current status (it can re-verify). | ❌ Add the same checks as the database path. |

### Tiers and the academic record
| ID | Scenario | Today |
|---|---|---|
| TIER-01 | Two pending suggestions for one student → blocked by a partial unique index. | ✅ |
| TIER-02 | Approving an already decided suggestion → 409. | ✅ |
| TIER-03 | A suggestion goes stale when the rules or the record change → the system withdraws it. | ✅ |
| TIER-04 | A CGPA outside 0–10 → 400. A student-entered CGPA never replaces the official one. | ✅ |

### Messages
| ID | Scenario | Today |
|---|---|---|
| MSG-01 | Replying to a withdrawn message → 409. Replies turned off → 403. | ✅ |
| MSG-02 | Empty audience, too many selected students, invalid tier or year → 400. | ✅ |
| MSG-03 | A student replies to an announcement twice → the same private thread is reused (unique index). | ✅ |
| MSG-04 | Message all students without `MESSAGE_BROADCAST_ALL` → 403. | ✅ |

### Whole-system cases
| ID | Scenario | Today / plan |
|---|---|---|
| SYS-01 | **The database goes down mid-session.** | Production: ✅ Phase 1 (S1), every route returns 503 and demo logins are impossible. Development: ⚠️ still falls back to demo data; a banner (E11) is planned. |
| SYS-02 | **Out-of-date page:** someone else changed the record while you had it open. | ⚠️ The server must always re-check (P3/P4) and return 409. The UI then shows the message and refreshes the record. |
| SYS-03 | **Same action sent twice** (double-click, network retry). | ⚠️ Disable buttons while sending, plus unique indexes or 409s on the server. Floods are now limited per user (S9, 429). |
| SYS-04 | **Large uploads.** | ✅ Phase 1 (S8, S3, S10): 100 KB by default, 15 MB only on bid and earnings uploads, 1 MB on photos; PDFs and images are checked by their bytes. |
| SYS-05 | **Timezones.** Date-only deadlines end at 23:59 **UTC** (05:29 the next morning in India). | ⚠️ Use the institution's timezone from Settings. |
| SYS-06 | **Error messages are built in many different ways.** `httpError` is copied into 4 services, and others use `err: any`. | ⚠️ Safety net done in Phase 1 (S11): DB internals never reach users, and bad JSON or huge bodies return `{ message }`. The copies remain (left alone on purpose); new code should throw errors with a `statusCode`. |
| SYS-07 | **Stolen or old login token** (shared computer, password changed elsewhere). | ✅ Phase 1 (S5): 1-day sessions; changing the password ends every other session; inactive accounts get 401. |
| SYS-08 | **Fake "image" or `javascript:` link** as an earnings screenshot. | ✅ Phase 1 (S10): only real PNG, JPEG, WebP or GIF bytes are accepted. |
| SYS-09 | **Production started without a real secret**, or without MongoDB. | ✅ Phase 1 (S1, S2): the server refuses to start. |
| SYS-10 | **Staff without earnings access type `/earnings`.** The sidebar hides the link and the API returns 403 (data is safe), but the page has no `RequirePermission` guard, so it shows an empty page with errors. | ❌ Add the page guard (`EARNINGS_SUBMIT` or `EARNINGS_VIEW_ALL`), like other hidden pages. |

---

## 6. Fix order (suggested)

1. **ALLOC-01 / ALLOC-02**: atomic claim on allocate. The biggest data-safety risk.
2. **BID-04 / BID-05**: the server refuses bids on closed, allocated or past-deadline work.
3. **BID-01 / BID-02**: `$inc` for the count, UUIDs for ids.
4. **EARN-01 / EARN-02**: atomic verification, and a unique key against duplicate earnings.
5. **BID-11 / BID-10**: tell losing bidders; let students withdraw bids.
6. **BID-06–09**: tier, safeguard, amount and PDF checks at bid time.
7. The rest (SYS-*, timezones, shared error helper).

Each fix needs a test in `apps/api/src/tests/` named with its ID, and must pass `npm test` and `test:mock`.

## 7. Adding a new edge case

1. Give it the next ID in its area (`BID-14`, `EARN-06`, …) and add a row here: scenario, today, fix.
2. Choose the pattern (P1–P5). Prefer a **database guarantee** (index or atomic update) over a code check.
3. Write the test first; it should fail. Then fix the code, and the test should pass.
4. Change the row to ✅.
