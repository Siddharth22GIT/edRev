# Edge cases: how we handle them

A study guide to what can go wrong in REVALANCHE and how the code deals with it.
Last checked against the code: 30 Oct 2026, after Phase 1 ([security](modules/security.md)) and Phase 2 ([bids and allocation](modules/bids-and-allocation.md)).

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

The full, current flow (student and staff sides, status lifecycles) is in **[modules/bids-and-allocation.md](modules/bids-and-allocation.md) §2**. In short:

```
Student: open opportunity → (closed? tier too low? already bid?) → bid → edit / withdraw while SUBMITTED
Staff:   review bids → allocate (atomic claim, one winner) → others REJECTED + messaged → reassign if needed
         → student delivers → staff confirm delivery → on time / late recorded
```

## 3. Two students bid at the same time

**Short answer: that's normal and allowed.** Bidding isn't first-come-first-served. Both bids are saved as separate records and staff pick one later. "Same time" causes only three small technical problems, and all three are on our side:

| ID | What happens | Today | Fix |
|---|---|---|---|
| BID-01 | **Bid count loses a number** when two bids land at once. | ✅ Phase 2 (E3) | `$inc` in one database update. Test: 5 simultaneous bids → count 5. |
| BID-02 | **Same bid id** for two bids in the same millisecond. | ✅ Phase 2 (E3) | `bid-<uuid>` ids; "already bid" only for a clash on (opportunity, student). |
| BID-03 | **The same student double-clicks**, or bids from two tabs at once. | ✅ | Button disabled while sending + unique index: one 201, one 409 (tested in Phase 2). |

**The real "same time" conflict is at allocation**, when two staff allocate the same project:

| ID | What happens | Today | Fix |
|---|---|---|---|
| ALLOC-01 | Two staff allocate **different students** at the same moment. | ✅ Phase 2 (E1) | Atomic claim (`status in OPEN/UNDER_REVIEW → ALLOCATED` in one update): one wins, the other gets a friendly 409. Bids change only after the claim; the claim is undone if the allocation record can't be written. |
| ALLOC-02 | An out-of-date page allocates **already allocated or delivered** work. | ✅ Phase 2 (E1, E1b) | 409 "already allocated. Use Reassign". Changing the student is a separate, logged Reassign action (Coordinator/Admin, with a reason). |

---

## 4. Other bid and allocation edge cases

| ID | Scenario | Today | Fix |
|---|---|---|---|
| BID-04 | Bidding on **ALLOCATED or CLOSED** work; a bid flipping ALLOCATED back to UNDER_REVIEW. | ✅ Phase 2 (E2) | 409; a bid only moves OPEN → UNDER_REVIEW. |
| BID-05 | Bidding **after bidding closes**. | ✅ Phase 2 (E2) | Optional `bidsCloseAt` per opportunity → 409 after it. (Not tied to the client `deadline`, because the seeded demo opportunities have past deadlines.) |
| BID-06 | Bidding on work **above the student's tier**. | ✅ Phase 2 (E4) | 403 at bid time, naming both tiers. |
| BID-07 | Safeguards (exam blackout, hour cap) block the student. | ✅ Phase 2 (E4) | Bid accepted with a **warning**; still a hard block at allocation. |
| BID-08 | **Bad amount:** negative, zero, text; or far above the budget. | ✅ Phase 2 (E4) | 400 for bad values; above budget is accepted with a warning. |
| BID-09 | **Proposal file** is not a PDF, or is too large. | ✅ Phase 1 (S3) | The server checks the bytes start with `%PDF-` and the file is ≤ 10 MB (400 otherwise). Downloads take their type from the real bytes; non-PDFs never open in the browser. |
| BID-10 | A student wants to **edit or withdraw** a bid. | ✅ Phase 2 (E5) | `PATCH /bids/mine` while SUBMITTED; `POST /bids/mine/withdraw` while SUBMITTED/SHORTLISTED; bidding again revives the same record. |
| BID-11 | **Losing bidders are never told.** | ✅ Phase 2 (E5) | On allocation other live bids → REJECTED and each student gets a "Bid update" message (failures logged, never undo the allocation). |
| BID-12 | A student sees **another student's bid**. | ✅ | Students only get their own bid back; staff with `BID_REVIEW` see all. Proposal downloads are checked the same way (403). |
| BID-13 | Login expires while the student is filling the form. | ⚠️ | 401 is returned (sessions now last 1 day, S5). The form should keep what was typed and ask the student to log in again. |
| ALLOC-03 | Allocating to a student who **never bid**. | ✅ Phase 2 (D7) | 400; an Administrator may assign directly with a reason (stored as `directAssignmentReason`). |
| ALLOC-04 | The student becomes **ineligible after bidding** (CGPA dropped, blackout started). | ✅ | Safeguards are re-checked at allocation (400 with reasons). |
| ALLOC-05 | **SLA deadline already in the past** at allocation. | ✅ Phase 2 (E7) | Agreed deadline = staff's choice (future only) → client due date if ahead → now + 7 days. |
| ALLOC-06 | The allocation record can't be written after the opportunity was claimed. | ✅ Phase 2 | The claim is undone (status restored), then an error is returned. |
| E1b | Reassigning delivered work, two reassignments at once, or reassigning without a reason. | ✅ Phase 2 | 409 / 409 (atomic on the current student) / 400. History kept in `reassignments`. |
| DEL-01 | Delivery confirmed **twice**. | ✅ | 409 "already confirmed". |
| DEL-02 | Delivery date **before allocation**, or **in the future**. | ✅ | 400. |
| DEL-03 | What "on time" is measured against. | ✅ Phase 2 (D6) | The later of the allocation's agreed deadline and the client's due date, in the institution's timezone. |

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
| AUTH-06 | `joinedAt` used the UTC date (could show the previous day in India). | ✅ Phase 2 (E9): institution timezone from Settings. |

### Earnings
| ID | Scenario | Today |
|---|---|---|
| EARN-01 | The same earning (platform + date + amount) submitted twice, even at the same moment. | ✅ Phase 2 (E6): code check + unique index → 409. |
| EARN-02 | Deciding an already verified or rejected earning; two verifiers at once. | ✅ Phase 2 (E6): decision only while PENDING, in one update → second gets **409**. |
| EARN-03 | Rejecting without a reason → 400. Amount or exchange rate ≤ 0 → 400. | ✅ |
| EARN-04 | A student views another student's earnings → 403. | ✅ |
| EARN-05 | Demo data mode re-verifying a decided earning. | ✅ (the service's demo path checks the status; now 409 like MongoDB mode). |

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
| SYS-01 | **The database goes down mid-session.** | Production: ✅ Phase 1 (S1), every route returns 503 and demo logins are impossible. Development: still falls back to demo data, and the top-bar badge (re-checked every minute, E11) says changes won't be saved. |
| SYS-02 | **Out-of-date page:** someone else changed the record while you had it open. | ⚠️ The server must always re-check (P3/P4) and return 409. The UI then shows the message and refreshes the record. |
| SYS-03 | **Same action sent twice** (double-click, network retry). | ⚠️ Disable buttons while sending, plus unique indexes or 409s on the server. Floods are now limited per user (S9, 429). |
| SYS-04 | **Large uploads.** | ✅ Phase 1 (S8, S3, S10): 100 KB by default, 15 MB only on bid and earnings uploads, 1 MB on photos; PDFs and images are checked by their bytes. |
| SYS-05 | **Timezones.** | ✅ Phase 2 (E9): date-only deadlines end at 23:59:59.999 in the institution's timezone (`utils/time.ts`). |
| SYS-06 | **Error messages are built in many different ways.** `httpError` is copied into 4 services, and others use `err: any`. | ⚠️ Safety net done in Phase 1 (S11): DB internals never reach users, and bad JSON or huge bodies return `{ message }`. The copies remain (left alone on purpose); new code should throw errors with a `statusCode`. |
| SYS-07 | **Stolen or old login token** (shared computer, password changed elsewhere). | ✅ Phase 1 (S5): 1-day sessions; changing the password ends every other session; inactive accounts get 401. |
| SYS-08 | **Fake "image" or `javascript:` link** as an earnings screenshot. | ✅ Phase 1 (S10): only real PNG, JPEG, WebP or GIF bytes are accepted. |
| SYS-09 | **Production started without a real secret**, or without MongoDB. | ✅ Phase 1 (S1, S2): the server refuses to start. |
| SYS-10 | **Staff without earnings access type `/earnings`.** | ✅ Phase 2: page guard (`EARNINGS_SUBMIT` or `EARNINGS_VIEW_ALL`) shows "Not available for your role". |

---

## 6. Fix order (suggested)

**Done:** 1–4 and the bid-time checks in 6 (Phase 1 and Phase 2, 30 Oct 2026). Remaining items are listed in [improvement-plan.md](improvement-plan.md).

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
