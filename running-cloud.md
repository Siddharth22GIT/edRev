# Running notes: where we left off (7 Nov 2026)

**Next:** Phase 4 (safeguards + SLA engine). First ask the user for decisions D1–D5. Task list: `CLAUDE.md` → "Next session".

## Phase 3 (new look): done 7 Nov

See [`docs/modules/ui-shell.md`](docs/modules/ui-shell.md). Covers:
- U1 fonts (Inter + JetBrains Mono via `next/font`) and U2 CSS-variable design tokens
- U3 orange collapsible icon rail (`preferences.navCollapsed`) and U4 top-bar identity block
- U5 notice line, U6 quick links, U7 `TabCard`
- U8 student and U9 staff dashboard cards (each card fails on its own)
- U10 contrast and focus fixes; U11 names trimmed on read and the fake "% match" hidden

163 API tests in both modes (3 new; 1 / 12 skipped as before), web build OK. Screenshots: student (desktop and phone), administrator, coordinator (rail collapsed), analyst opportunities list.
**Heads-up:** `next/font` downloads the fonts from Google at build/dev start, so it needs internet once. Without it, dev falls back to system fonts.

Pick up here next session. Project rules and conventions are in `CLAUDE.md`.

**Master to-do:** [`docs/improvement-plan.md`](docs/improvement-plan.md) (phases 0–6, decisions D1–D9). Edge cases: [`docs/edge-cases.md`](docs/edge-cases.md).

## State of the repo

- Last commits (30 Oct): Tailwind fix, Messages (Phase 3), security (Phase 1), docs.
- Phases 1 and 2 committed. Next: Phase 3 (new look).
- API tests: 160 total, all passing in both modes (`npm test` and `npm run test:mock --workspace @edurev/api`).

## Phase 2 (bids and allocation): done 30 Oct

See [`docs/modules/bids-and-allocation.md`](docs/modules/bids-and-allocation.md). 160 tests pass in both modes; web build OK; checked in Chrome as a student, an analyst and a coordinator.
Next: Phase 3 (new look) in `docs/improvement-plan.md`. Phase 4 needs decisions D1–D5 (hour caps, attendance, parallel projects, extensions, cool-down).

## Phase 1 (security): done and committed 30 Oct (3ba0e49)

See [`docs/modules/security.md`](docs/modules/security.md). 141 tests pass in both modes; web build OK; checked in Chrome for a student and an analyst.
**Restart `npm run dev`** (Next.js was patched from 15.5.25 to 15.5.28, and `next.config.ts` changed).

## To-do: tomorrow

### 1. ~~Fix: "Send" in My Messages does nothing~~ ✅ Fixed (30 Oct)

Fixed by the user. The cause was unrelated to the layout, so the planned layout and robustness changes aren't needed.

### 2. Commit

- [x] Committed: `c152a50` Tailwind fix, `e72bf51` Messages, `3ba0e49` security, `97ac0b4` docs.

### 3. Loose ends from earlier phases

- [ ] **Stale tier suggestion for Rohan (stu-202):** a pending TIER 2 → TIER 3 suggestion created under the *old* rules. Under the new rules he doesn't qualify (CGPA 7.80 < 9.0). Dismiss it on the Students page, or let the system withdraw it the next time his record changes.
- [ ] `joinedAt` for newly approved sign-ups uses the UTC date, so it can show the previous day in IST. Use the institution timezone instead.
- [x] ~~Update `README.md` for sign-up, tiers, delivery tracking and messages.~~ Rewritten 1 Nov 2026 with Mermaid diagrams.

### 4. Messages follow-ups (agreed for later)

- [ ] Link mentors (Guild Leads) to student records by account instead of by name, then optionally limit mentors to messaging their own mentees.
- [ ] Staff-to-staff direct messages.
- [ ] Instant updates (server push) instead of the 30-second poll.

### 5. Phase 4 extras (roadmap in CLAUDE.md)

- [ ] Skill-based match score (replace the fixed "94% match")
- [ ] Achievement badges (first bid, first verified earning, training complete, tier up)
- [ ] Saved / bookmarked opportunities
- [ ] Mentor skill endorsements
- [ ] Dark mode
- [ ] Deadline reminders ("bid closes in 2 days")

## How to resume

```bash
npm run dev                                  # web :3000, api :4000 (MongoDB on 127.0.0.1:27017)
npm run typecheck
npm test
npm run test:mock --workspace @edurev/api
NEXT_DIST_DIR=.next-build npm run build --workspace @edurev/web   # build while dev is running
```

**Heads-up:** a production build rewrites `apps/web/tsconfig.json` and `next-env.d.ts`, which makes a running `next dev` reload. Restore both afterwards (`git checkout -- apps/web/next-env.d.ts apps/web/tsconfig.json`), and avoid building while you're actively testing in the browser.
