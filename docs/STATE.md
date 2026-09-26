# State — read me first

_Last updated: 2026-09-25 (end of session 2, M0 closed) · next session: start here_

## Where we are

**Milestone:** M0 — Foundation: **complete** once this PR merges (closes #2).

- #1 Drizzle + Postgres, `/api/health`, migrate service (PR #18, ADR-0011).
- #2 staging: DEMO_MODE build guard + banner (PR #19), Vercel standalone fix (PR #20),
  live at https://networth-staging.vercel.app with Neon (Singapore). Verified: `/api/health` 200
  `db:"ok"`, and the demo banner renders. `docs/DEPLOYMENT.md` has the exact dashboard steps.

## Next session picks up

M1 from **#3 (crypto primitives)**. Brief: `docs/phases/M1.md`. `area:crypto` needs owner approval to merge.

## Also open

- PR #17 (`docs/ux-insights-final`): insights + projections UX pass. Needs the owner's
  call on return assumptions, 6% inflation, 4% withdrawal rate, and deterministic vs Monte Carlo fan
  (`docs/UX.md` §12.1).
- Issue #14: discuss features worth borrowing from other apps. Licence still unchosen.

## Gotchas / open threads

- **Staging migrations are manual**: after any new `drizzle/` migration, run `pnpm db:migrate`
  against Neon's unpooled URL (DEPLOYMENT.md step 4) *before* merging code that needs it.
- Neon URLs may carry `channel_binding=require`; postgres.js forwards it as a startup param.
  It works on Vercel today; if staging ever reports `db:"down"`, strip it in `client.ts`.

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
cd D:/Work/claude-apps/networth-tracker && git switch main && git pull && gh issue view 3
```
