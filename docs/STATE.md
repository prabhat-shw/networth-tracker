# State — read me first

_Last updated: 2026-09-26 (end of session 2) · next session: start here_

## Where we are

**Milestone:** M0 — Foundation: **complete.** No open M0 issues. Next: **M1 — Identity & crypto core.**

Session 2 closed #1 and #2:

| PR | What landed |
| --- | --- |
| #18 | Drizzle + Postgres, ciphertext-only `records` table, Compose `migrate` service, `/api/health` ([ADR-0011](decisions/0011-database-access-and-migrations.md)) |
| #19 | `DEMO_MODE` build guard + demo banner ([ADR-0012](decisions/0012-staging-guard-and-vercel-build.md)) |
| #20 | Standalone output off on Vercel (Next 16.3 `nft.json` ENOENT) |
| #21, #22 | Staging live; click-by-click `docs/DEPLOYMENT.md`; URL moved to `networth-staging` |

Staging: **https://networth-staging.vercel.app** (Vercel project `networth-tracker-pxac`,
Neon in Singapore). Verified 2026-09-26: `/api/health` 200 `db:"ok"`, banner renders,
`/api/version` = latest `main`. Home stack verified end to end via Compose (PR #18).
Green on `main`: `pnpm test` (18) · `typecheck` · `check` · `check:docs` · `docs:check`.

## Next session picks up

**Issue #3: crypto primitives** (Argon2id, AES-GCM, ECDH P-256, HKDF, AES-KW; `size:M`).
Brief: `docs/phases/M1.md`. `area:crypto`, so **the owner approves the merge**; never self-merge.

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
- **Vercel:** import the repo only once (a re-import made a duplicate project, since deleted).
  Env vars need a **Redeploy** to take effect. `APP_ORIGIN` = the staging URL (used from M1 auth).
- **Docker on Windows:** the image only builds because of the new `.dockerignore`; never
  remove `node_modules` from it. Docker Desktop must be running (`docker info`).
- For a throwaway local stack, export `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `APP_ORIGIN`
  and use `docker compose -p nwt-e2e …` then `down -v`, so the real volume is never touched.
- `records` has no FK to households yet; add it with #5.
- Repo is **public** (ADR-0010); `main` protected (PR + green `verify`/`security`).
- Kanban: https://github.com/users/prabhat-shw/projects/2. Move cards as you go.
- Merge policy (owner): merge when CI is green **and the owner says so** in the session
  (the auto-mode classifier blocks unrequested merges). `area:crypto`/`area:security` always wait for approval.
- `docs/` is excluded from Biome; `next dev` appends an agent-rules block to `CLAUDE.md` (committed on purpose).
- Money is integer **paise**; use `src/domain/money.ts`.
- **Check exit codes, not output text** (Biome's ANSI output hides failures; use `NO_COLOR=1`).

## Resume command

```
cd D:/Work/claude-apps/networth-tracker && git switch main && git pull && gh issue view 3
```
