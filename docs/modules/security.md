# Security (Phase 1)

Built 30 Oct 2026. Plan: [improvement-plan.md](../improvement-plan.md) Phase 1. Edge-case IDs: [edge-cases.md](../edge-cases.md).

## 1. What it does

Protects REVALANCHE from the most likely real attacks and accidents: logging in with the shared demo password, forged login tokens, harmful uploaded files, stolen or outdated sessions, oversized or flooding requests, and database errors leaking to users. Each protection is small and lives in one place, so the rest of the app didn't need to change.

## 2. Flow: what happens to every API request now

```
Request
  │
  ├─ helmet ─────────────── adds security headers (S7)
  ├─ sanitizeErrorResponses  wraps res.json so DB internals never reach users (S11)
  ├─ body parser ─────────── 15 MB on bid / earnings uploads, 1 MB on photos, 100 KB everywhere else (S8)
  ├─ /api/health ─────────── always public, always answers
  ├─ requireDatabaseWhenDemoDisallowed  production + no DB → 503 (S1)
  ├─ route: authenticate ─── token signature + expiry, then "is this session still current?" (S5)
  │         requirePermission
  │         limitPerUser ─── write routes only: too many → 429 (S9)
  │         controller ───── upload checks: real PDF / real image by bytes (S3, S10)
  ├─ 404 handler
  └─ jsonErrorHandler ────── bad JSON → 400, too large → 413, crash → 500, always { message } (S11)
```

**Server start (production only):** refuse to start without a strong `JWT_SECRET` (S2), or without MongoDB (S1).

## 3. Rules

| ID | Rule |
|---|---|
| S1 | Demo data mode (in-memory data, dev password `Password123!`) only runs when `NODE_ENV` isn't `production`, unless `ALLOW_DEMO_MODE=true`. In production: no DB at start → the server exits; DB lost later → every `/api` route except `/health` returns **503**. |
| S2 | In production, `JWT_SECRET` must be set, at least 32 characters, and not the development default. Otherwise the server won't start. |
| S3 | A bid's proposal must be a `data:` URL whose bytes start with `%PDF-`, at most 10 MB. On download, the type comes from the real bytes: only real PDFs can open in the browser (`inline`); anything else downloads as `application/octet-stream`. File names in headers lose control characters (no header injection). |
| S5 | Login tokens last **1 day** (was 7). Each token carries `tv` (token version). Every request checks the account: `PENDING_APPROVAL` or `REJECTED` → 401; `tv` different from the stored `tokenVersion` → 401 "Your session has ended". Changing the password increases `tokenVersion` (ending every other session) and returns a fresh token for the current device. |
| S7 | API: `helmet` headers (`nosniff`, frame blocking, no `X-Powered-By`…). Web: a Content Security Policy plus `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`. |
| S8 | Request body limits: 100 KB by default; 15 MB on `POST /opportunities/:id/bids` and `POST /earnings`; 1 MB on `PUT /students/:id/photo`. |
| S9 | Per **user** (not per IP, because a campus shares IPs): bids 30/hour, earnings 30/hour, messages and replies 60 per 10 minutes, photo uploads 20/hour. Over the limit → 429. |
| S10 | An earnings screenshot must be a `data:` URL holding a real PNG, JPEG, WebP or GIF (checked by its first bytes), at most 10 MB. Links and `javascript:` URLs are refused. |
| S11 | Any error message containing database internals (`E11000`, `MongoServerError`, `Cast to … failed`…) is replaced: duplicates → **409** "This record already exists.", bad values → 400, everything else → 500 "Something went wrong on our side." The real message is logged on the server. |
| S12 | `POST /hours` validates `hours` (number, > 0, ≤ 24) and no longer echoes unknown fields. It still doesn't store hours: that needs weekly periods and moves to the safeguards engine (Phase 4, G2). The response says so. |
| S13 | `npm audit`: 11 findings → 8 fixed with patch/minor updates only (all 4 critical included), e.g. Next.js 15.5.25 → 15.5.28, body-parser 2.4.0, proxy-addr 2.0.8, qs 6.17.1, sharp 0.35.5, shell-quote 1.12.0. **3 accepted for now:** PostCSS 8.4.31 bundled inside Next 15 (the fix needs Next 16, a major upgrade; it only processes our own CSS at build time) and esbuild under `tsup`/`tsx` (only affects esbuild's own dev server, which we don't use). Re-check when moving to Next 16. |

## 4. Data

| Where | Field | Notes |
|---|---|---|
| `users` collection | `tokenVersion` (number, **new**) | Hidden from normal reads (`select: false`), never sent to the browser. Missing = 0. |
| Login token (JWT) | `tv` (**new**) | Copy of `tokenVersion` at sign-in. Old tokens without `tv` count as 0. |
| `User` type (`packages/types`) | `tokenVersion?` (**new**, optional) | Additive only. |

No other data changed.

## 5. API changes

| Endpoint | Change |
|---|---|
| **Every route** | May now return **413** (body too large) and **400** (invalid JSON) as `{ message }`; raw DB errors become friendly messages. |
| Every authenticated route | May return **401** "Your session has ended. Please sign in again." or "Your account is not active." |
| Every `/api` route except `/health` | **503** in production when the database is down. |
| `POST /auth/password` | Response now also contains `token` (additive): `{ message, token }`. The old token stops working. |
| `POST /opportunities/:id/bids` | **400** when the proposal isn't a real PDF ≤ 10 MB. **429** over the limit. |
| `GET /opportunities/:id/bids/:bidId/proposal` | `Content-Type` from the real bytes; non-PDFs are always `attachment`; `nosniff`. |
| `POST /earnings` | **400** when the screenshot isn't a real image ≤ 10 MB. **429** over the limit. |
| `POST /messages`, `POST /messages/:id/replies` | **429** over the limit. |
| `PUT /students/:id/photo` | **429** over the limit. |
| `POST /hours` | **400** for bad `hours`; response `data` is `{ studentId, hours, date?, note? }`. |

## 6. Edge cases

| ID | What can happen | How we handle it |
|---|---|---|
| S1-a | MongoDB is down when a production server starts | The server exits with a clear message (`REQUIRE_DB` behaviour is now automatic in production). |
| S1-b | MongoDB drops while running in production | Every `/api` request except `/health` gets 503, so no one can log in with the demo password. |
| S1-c | A classroom demo without MongoDB, in production mode | Set `ALLOW_DEMO_MODE=true` on purpose. |
| S2-a | `JWT_SECRET` missing, short, or the dev default in production | Refuses to start; the message says which. |
| S3-a | HTML or SVG renamed to `.pdf` | Rejected at upload: the bytes don't start with `%PDF-`. |
| S3-b | Old records already holding non-PDF files | Download as `application/octet-stream` attachments, so they can't open as a page. |
| S3-c | File name with line breaks (header injection) or non-English characters | Control characters become `_`; an ASCII fallback name plus the exact UTF-8 name (`filename*`). |
| S3-d | A plain link, an empty file, or over 10 MB | 400 with a clear message. |
| S5-a | Password changed on another device | All older tokens get 401 on their next request; the web app signs that device out. |
| S5-b | Password changed on this device | The response carries a fresh token; the web app stores it, so you stay signed in. |
| S5-c | Sign-up rejected while a token is still valid | 401 "Your account is not active." |
| S5-d | Token for an id with no user record | Allowed (no account is ever deleted; only someone with the secret could make one). Tests rely on this. |
| S5-e | Demo data mode | No stored sessions, so only the signature and expiry are checked. |
| S8-a | Normal route with a huge body | 413 before any code runs. |
| S8-b | 10 MB proposal | Accepted, because the upload route's 15 MB parser runs first. |
| S9-a | Whole class on one Wi-Fi network | Limits are per signed-in user, so they don't affect each other. |
| S9-b | API restarts | Counters reset (kept in memory). Fine for one server; several servers would need a shared store (Redis). |
| S9-c | A limit is too strict for an event | Raise it without code changes: `RATE_LIMIT_BIDS`, `RATE_LIMIT_EARNINGS`, `RATE_LIMIT_MESSAGES`, `RATE_LIMIT_UPLOADS`. |
| S10-a | `javascript:` or `https://` "screenshot" | 400; only uploaded image bytes are accepted. |
| S10-b | HEIC photo from a phone | 400 with "PNG, JPEG, WebP or GIF". (Convert, or we can add HEIC later.) |
| S11-a | Two requests create the same unique record | 409 "This record already exists." instead of `E11000 duplicate key…`. |
| S11-b | Malformed JSON body | 400 "The request body is not valid JSON." (was an HTML error page). |
| S11-c | Unexpected crash | 500 with a generic message; details only in the server log. |

## 7. Tests

`apps/api/src/tests/security.test.ts`, one test per ID (runs in both modes):

| Test | Proves |
|---|---|
| S1 | With `NODE_ENV=production` and no DB, login returns 503 (demo mode); with a DB it works normally. |
| S2 | Missing, default and short secrets are reported; 32+ characters pass. |
| S3 (4 tests) | Only real PDFs pass; a fake PDF bid gets 400; a stored HTML file downloads as an attachment with `nosniff`; a real PDF opens inline and a CRLF file name can't inject a header. |
| S5 | A signed token for a `PENDING_APPROVAL` account gets 401 (MongoDB only). |
| S7 | `nosniff` and `X-Frame-Options` are present; `X-Powered-By` is gone. |
| S8 (2 tests) | 200 KB on login → 413 JSON; 300 KB on the bid route reaches the handler. |
| S9 | With the limit set to 2, the third reply → 429; another user is unaffected. |
| S10 | Real PNG passes; `javascript:`, links and fake PNGs fail; the earnings route returns 400. |
| S11 (2 tests) | `E11000` → 409 friendly message; invalid JSON → JSON 400. |
| S12 | Bad hours → 400; extra fields aren't echoed; the note says "not stored". |

Also updated: `account-settings.test.ts` now checks that the old token gets 401 after a password change and the fresh one works.

## 8. How to change it safely

| To change… | Edit | Watch out for |
|---|---|---|
| Body size limits | `apps/api/src/app.ts` (the parsers before `express.json({ limit: "100kb" })`) | Route-specific parsers must stay **above** the default one. |
| Rate limits | The `limitPerUser(...)` lines in the route files, or env vars | Keep the limiter **after** `authenticate` so it counts per user. |
| Allowed upload types | `apps/api/src/utils/uploads.ts` | Update the browser's `accept=` and messages too. |
| Session length | `JWT_EXPIRES_IN` env var (default `1d`) | Longer = more convenient, but a stolen token works for longer. |
| End all sessions for a user | Increase `tokenVersion` in the database | They'll be signed out on their next request. |
| Web CSP | `apps/web/next.config.ts` | Any new outside service (fonts, analytics, a CDN) must be added, or it will be blocked. Check the browser console. |
| Friendly error rules | `sanitizeErrorMessage` in `middleware/security.middleware.ts` | Keep messages free of internal details. |

## Technologies used

| Technology | Used for |
|---|---|
| **helmet** (new npm package, v8) | Standard HTTP security headers on the API |
| **Express 5 middleware** | Body limits, the 503 database guard, rate limiting, error cleanup |
| **jsonwebtoken** (existing) | Tokens now include `tv`; 1-day expiry |
| **Mongoose** `select: false` + `$inc` | Hidden `tokenVersion`; increased in a single database update |
| **File signatures ("magic bytes")** | Detecting real PDFs and images from their first bytes |
| **Next.js `headers()`** | Content Security Policy and other headers on every web page |
| **Node test runner** (`node:test`) | `security.test.ts` |
| **npm audit** | Finding and fixing known vulnerable packages |

## Verified

- `npm run typecheck`: clean. `npm test`: 141 tests, 140 pass, 1 skipped (existing). `test:mock`: 129 pass, 12 skipped (11 existing + the MongoDB-only S5 test). Web build: succeeds.
- Headless Chrome, signed in as a student (dashboard, opportunities, an opportunity, earnings, messages, profile, account settings) and as a Bid Desk Analyst (dashboard, an opportunity, earnings, students): **no Content Security Policy violations, no script errors.**
- Found while checking (existing, not caused by Phase 1): an analyst who types `/earnings` sees the page with 403 errors, because the page has no `RequirePermission` guard (the sidebar link is already hidden). Logged as SYS-10.

## Not done in Phase 1 (and why)

| Item | Status |
|---|---|
| S4 (allocation race) | It's E1 in Phase 2: it changes the bids and allocation module, so it goes with the other bid fixes. |
| S6 (token in an httpOnly cookie) | Deferred (decision D9). The CSP and shorter sessions reduce the risk now. |
| S12 (actually storing hours) | Moved to Phase 4, G2 (needs weekly periods). |
| Shared `AppError` replacing the 4 `httpError` copies | Not done, to avoid touching modules that work. The error safety net covers the risk; new code should throw errors with a `statusCode`. |
