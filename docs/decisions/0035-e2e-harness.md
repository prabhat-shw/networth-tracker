# ADR-0035 — E2E harness: Playwright, throwaway Postgres + Mailpit

**Status:** Accepted · 2026-09-28 · issue #78 (part of #46)

## Context

M1's acceptance (#46) needs real browsers against the real server and database: two
members, codes sent by email, a restore on a fresh profile. Until now every test was Vitest
(unit, PGlite, browser components). Sign-in is invite-only and by emailed code, so a run
needs an inbox it can read.

## Decision

- **`@playwright/test`**, pinned to the installed `playwright` version, with specs in
  `e2e/` and `playwright.config.ts` at the root. It is separate from Vitest (`pnpm e2e`),
  and Vitest's globs (`src/**`) never pick the specs up.
- **The app under test is a production build** (`db:migrate && build && start -p 3100`),
  started by Playwright's `webServer`. It uses the installed Chrome (`channel: "chrome"`),
  as the browser project does, so CI downloads nothing. One worker, because specs share a
  database and walk multi-user flows.
- **Services are Postgres 17 + Mailpit (pinned `v1.31.3`)**. Locally they run in the
  `nwt-e2e` compose project (`compose.e2e.yml`, tmpfs data, bound to 127.0.0.1). In CI they
  are service containers on the same ports. Settings are fixed throwaway values in
  `e2e/env.ts`; none is a real secret.
- **The real paths, not shortcuts.** Invites use `scripts/invite.mjs`, the owner's own
  tool. Codes are read from Mailpit's HTTP API, and every step goes through the UI. Each
  run uses fresh addresses, so a mailbox holds only that run's codes.
- **CI:** `.github/workflows/e2e.yml` runs on PRs touching `src/server/**`, `src/crypto/**`,
  `src/features/auth/**`, `e2e/**`, `drizzle/**` or its own config, and on `main`. The
  report and traces are uploaded on failure. It is not a required check yet; #79 decides.

## Consequences

- #79 adds the M1 acceptance spec on top of `e2e/support.ts`, plus the build-flag record
  probe (owner decision 2026-09-28).
- Running locally needs Docker Desktop (STATE gotcha). The first build takes about a
  minute; `reuseExistingServer` skips it when an app is already on :3100.
- Passkeys cannot be exercised headless; fast unlock stays a manual owner check (#79).

## Alternatives rejected

- **Full `docker compose` production stack** (app image + Caddy): slow to build in CI, and
  it tests the packaging rather than the flows. DEPLOYMENT.md covers packaging.
- **Reading OTPs from the database:** they are stored hashed (ADR-0020), and a test backdoor
  in the mailer would be a production code path that exists only for tests.
