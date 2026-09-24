# State — read me first

_Last updated: 2026-09-25 (end of session 2) · next session: start here_

## Where we are

**Milestone:** M0 — Foundation. Only #2 (Vercel staging) left after this PR.

This session: **issue #1, Drizzle + Postgres wiring** (branch `chore/drizzle-postgres`, PR open).

- `src/server/db/schema.ts`: the ciphertext-only `records` table (ADR-0003). Its exact
  column set is pinned by `schema.test.ts`, which also fails on any text/json/numeric/enum column.
- `src/server/db/client.ts`: lazy postgres.js + Drizzle client, so builds need no DB.
- `drizzle/0000_init.sql`: the first migration. `pnpm db:generate` / `pnpm db:migrate`.
- `GET /api/health`: 200 `{status,app,db}`, or 503 with `db:"down"`. Status words only.
- Compose: a one-shot `migrate` service; `app` waits for it to exit 0.
- Decisions recorded in [ADR-0011](decisions/0011-database-access-and-migrations.md).

Verified end to end on this machine: `docker compose up` → migrate exit 0 → `\d records`
matches → `/api/health` via Caddy 200. DB stopped → 503 with no secrets → DB back → 200.
Green: `pnpm test` · `typecheck` · `check`.

## Next session picks up

**Issue #2: Vercel staging deploy with DEMO_MODE guard** (`size:S`). Closes M0.
Then M1 from #3 (crypto primitives); brief in `docs/phases/M1.md`.

## Also open

- PR #17 (`docs/ux-insights-final`): insights + projections UX pass. Needs the owner's
  call on return assumptions, 6% inflation, 4% withdrawal rate, and deterministic vs Monte Carlo fan
  (`docs/UX.md` §12.1).
- Issue #14: discuss features worth borrowing from other apps. Licence still unchosen.

## Gotchas / open threads

- **Docker on Windows:** the image only builds because of the new `.dockerignore`; never
  remove `node_modules` from it. Docker Desktop must be running (`docker info`).
- For a throwaway local stack, export `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `APP_ORIGIN`
  and use `docker compose -p nwt-e2e …` then `down -v`, so the real volume is never touched.
- `records` has no FK to households yet; add it with #5.
- Repo is **public** (ADR-0010); `main` protected (PR + green `verify`/`security`).
- Kanban: https://github.com/users/prabhat-shw/projects/2. Move cards as you go.
- Merge policy (owner): merge PRs yourself when CI is green; only core features
  (`area:crypto` / `area:security`) wait for approval.
- `docs/` is excluded from Biome; `next dev` appends an agent-rules block to `CLAUDE.md` (committed on purpose).
- Money is integer **paise**; use `src/domain/money.ts`.
- **Check exit codes, not output text** (Biome's ANSI output hides failures; use `NO_COLOR=1`).

## Resume command

```
cd D:/Work/claude-apps/networth-tracker && git switch main && git pull && gh issue view 2
```
