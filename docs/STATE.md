# State — read me first

_Last updated: 2026-09-28 (session 16, #64 merged, #69 in review) · next session: start here_

## Where we are

**Milestone:** M1 — Identity & crypto core. M0 complete (PRs #18-#22).

- **Merged in M1** (details in the ADRs): crypto primitives (0013), identity vault (0018),
  household key (0019), auth (0020, `src/server/auth.ts`), membership guard (0021), vault
  relay (0022), member relay + invites (0023), key session + unlock (0024, `src/features/lock/`),
  onboarding spec (0025, UX.md §3.0), sign-in + gate (0026, `src/features/auth/`), first run
  (0027, `src/features/onboarding/`), `GET /api/households` (#56). Neon migrated through `0006`.
- **#54 restore** merged (PR #60); **#58 test speed** merged (PR #62, [ADR-0028](decisions/0028-fast-kdf-in-tests.md):
  tests use the Argon2id bounds floor except `crypto.test.ts`). Vitest config is `vitest.config.mts`.
- **#52 join API** merged (PR #65, [ADR-0029](decisions/0029-ending-an-invite.md)): invites with
  the inviter's name in `GET /api/households`; cancel and decline endpoints.
- **#63 household gate** merged (PR #66, [ADR-0030](decisions/0030-household-key-after-unlock.md)):
  `src/features/household/`. Household key unwrapped after every unlock; waiting and confirm screens.
- **#64 Household panel** merged (PR #68, [ADR-0031](decisions/0031-inviter-household-panel.md)):
  `household-panel.tsx` + `panel-client.ts`, on the unlocked page. Invite, pending/ready rows, and
  the inviter's code check (match → wrap + `POST …/members`; mismatch → cancel, nothing wrapped).
- **#69 docs enforcement** on `chore/docs-enforcement`, PR #70 ([ADR-0032](decisions/0032-changelog-and-docs-impact.md)):
  CI fails `src/` changes without `CHANGELOG.md` (label `no-changelog` opts out); `/handoff` docs-impact pass.

## Next session picks up

Next: **#71** (flaky first-run test: repeated recovery word, `size:S`), then **#48** (passkey PRF fast unlock), then **#46** = M1 E2E gate, last (two members, invite via
the panel, decrypt, recovery). Follow-ups: ADR-0030 leave-household / pre-add code check, self re-wrap
after confirming; ADR-0031 member names in the members API. Green: `pnpm test` (152) ·
typecheck · check · build.

## Also open

- Insights UX: inflation 8% ([ADR-0014](decisions/0014-projection-defaults.md)), tap budgets
  ([ADR-0017](decisions/0017-tap-budgets.md)). Leftovers in #34 (settle "Home fits one screen" before M3).
- Issue #14 decided: all six ideas accepted as #25–#32 on M3/M5/M7/M8
  ([ADR-0016](decisions/0016-features-borrowed-from-other-apps.md)); licence AGPL-3.0-only
  ([ADR-0015](decisions/0015-agpl-licence.md)). New deps must be AGPL-compatible.

## Gotchas / open threads

- **Staging migrations are manual**: after any new `drizzle/` migration, run `pnpm db:migrate`
  against Neon's unpooled URL (DEPLOYMENT.md step 4) *before* merging code that needs it.
- Neon URLs may carry `channel_binding=require`; if staging reports `db:"down"`, strip it in `client.ts`.
- **Vercel:** import the repo only once (a re-import made a duplicate project, since deleted).
  Env vars need a **Redeploy** to take effect. `APP_ORIGIN` = the staging URL (used from M1 auth).
- **Docker on Windows:** the image only builds because of the new `.dockerignore`; never
  remove `node_modules` from it. Docker Desktop must be running (`docker info`).
- For a throwaway local stack, export `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `APP_ORIGIN`,
  `SMTP_HOST`, `SMTP_FROM` (dummies are fine)
  and use `docker compose -p nwt-e2e …` then `down -v`, so the real volume is never touched.
- Neon `db:migrate` prints "…already exists, skipping" NOTICEs; they are harmless.
- New household-scoped routes: call `guardHousehold` first; never answer 403 (ADR-0021).
- Server tests that touch SQL: use PGlite with the real migrations (`migratedDb()` from `db/test-db.ts`), not
  the Better Auth memory adapter, which hides schema bugs.
- Repo is **public** (ADR-0010); `main` protected (PR + green `verify`/`security`).
- Kanban: https://github.com/users/prabhat-shw/projects/2. Move cards as you go.
- Merge policy (owner): merge when CI is green **and the owner says so** in the session
  (the auto-mode classifier blocks unrequested merges). `area:crypto`/`area:security` always wait for approval.
- `docs/` is excluded from Biome; `next dev` appends an agent-rules block to `CLAUDE.md` (committed on purpose).
- Money is integer **paise**; use `src/domain/money.ts`.
- Crypto: never export a private key or HDK except via `wrapKey`; `open` failures are always
  `DecryptError` (no detail). `gh issue list -m` needs the full milestone title.
- **Docs per PR:** `CHANGELOG.md` gets an Unreleased line for every user-visible change (it lagged
  all of M1 until #64); new concepts go in `docs/kb/` + GLOSSARY. Map: `docs/kb/07-keeping-docs-current.md`.
- **Check exit codes, not output text** (Biome's ANSI output hides failures; use `NO_COLOR=1`).

## Resume command

```
cd D:/Work/claude-apps/networth-tracker && git switch main && git pull && gh issue list -m "M1 Identity & crypto core" -s open
```
