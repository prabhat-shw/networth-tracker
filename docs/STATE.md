# State — read me first

_Last updated: 2026-09-25 (end of session 2, part 2) · next session: start here_

## Where we are

**Milestone:** M0 — Foundation: code complete. #1 merged (PR #18). #2 PR open (`chore/vercel-staging`).

Issue #2 (this PR) added:
- `src/lib/deploy-guard.ts` (+ test): `VERCEL=1` without `DEMO_MODE=true` → `next build`
  throws. Verified with real builds: fails without it, passes with it.
- `src/features/version/demo-banner.tsx` in the root layout; `NEXT_PUBLIC_DEMO_MODE` is inlined at build.
- `docs/DEPLOYMENT.md`: both targets, including the Vercel/Neon dashboard steps.

**Owner action to finish #2:** create the Vercel project + Neon store and set env vars,
exactly as `docs/DEPLOYMENT.md` → *Staging* says. Needs your accounts; no CLI here.

## Next session picks up

M1 from **#3 (crypto primitives)**. Brief: `docs/phases/M1.md`. `area:crypto` needs owner approval to merge.

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
cd D:/Work/claude-apps/networth-tracker && git switch main && git pull && gh issue view 3
```
