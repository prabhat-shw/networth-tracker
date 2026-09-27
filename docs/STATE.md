# State — read me first

_Last updated: 2026-09-27 (session 12, #56 in review) · next session: start here_

## Where we are

**Milestone:** M1 — Identity & crypto core. M0 complete (PRs #18-#22).

- Merged: #3 primitives (ADR-0013), #4 identity vault (ADR-0018), #5 household + HDK
  ([ADR-0019](decisions/0019-household-key-wrapping.md)).
- **#6 auth core** merged (PR #39, [ADR-0020](decisions/0020-auth-invite-only-otp-passkeys.md)):
  `src/server/auth.ts` (`createAuth` + lazy `getAuth`), `invites.ts`, `pnpm auth:invite`,
  `/api/auth/[...all]`, `0002_auth` (+ `0003` uuid defaults, #40). Staging has SMTP vars set.
- **#37 authorisation** merged (PR #42, [ADR-0021](decisions/0021-household-authorisation.md)):
  `guardHousehold` (401 / identical 404), `GET /api/households/:id/records`, member_id→user FK
  (`0004`, applied on Neon). `migratedDb()` in `src/server/db/test-db.ts`. Node pinned `24.x`.
- **#38 vault relay** merged (PR #44, [ADR-0022](decisions/0022-identity-vault-relay.md)):
  `src/crypto/wire.ts` (codec + `KDF_BOUNDS`), `identity_vaults` (`0005`), `GET/PUT /api/identity/vault`.
- **#43 member relay** merged (PR #47, [ADR-0023](decisions/0023-household-member-relay.md)):
  `src/server/members.ts`, `household_invites` (`0006`, applied on Neon), `POST /api/households`,
  `…/:id/members`, `…/:id/invites`. Public keys always come from the vault.
- **#7 lock/unlock** merged (PR #49, [ADR-0024](decisions/0024-lock-unlock-session.md)):
  `src/features/lock/key-session.ts` (keys only in a closure, 5-min auto-lock, `pagehide`
  lock) and `unlock-screen.tsx`. UX.md §3.1 approved; passkey unlock split to **#48**.
- **#50 UX.md §3.0** (sign-in, first run, joining with a code check) approved and merged
  (PR #51, [ADR-0025](decisions/0025-onboarding-flow.md)). #45 unblocked and split (see below).

- **#45 sign-in + routing gate** merged (PR #55, [ADR-0026](decisions/0026-component-tests-browser-mode.md)):
  `src/features/auth/` (auth client, `SignIn`, `AppGate` wrapping `/`). Component tests now
  run in Vitest browser mode on the **installed Chrome**. #45 was split: #53 first run, #54 restore.
- **#56** `GET /api/households` (my households + `invited`), split from #53: `src/server/households.ts`.

## Next session picks up

**#53 first run** (passphrase, recovery kit + hand-written PDF, vault upload, silent
household via #56). Then **#54** restore, **#52** joining. **#48** passkey
unlock in parallel. **#46** = M1 E2E gate, last. Green: `pnpm test` (118) · typecheck · check.

## Also open

- Insights + projections UX (PR #17) merged: inflation 8% ([ADR-0014](decisions/0014-projection-defaults.md)),
  UX principle 8 "fewest actions" with tap budgets ([ADR-0017](decisions/0017-tap-budgets.md)); the
  prototype meets all 7 budgets. Leftovers in #34 (settle "Home fits one screen" before M3 forms).
- Issue #14 decided: all six ideas accepted as #25–#32 on M3/M5/M7/M8
  ([ADR-0016](decisions/0016-features-borrowed-from-other-apps.md)); licence AGPL-3.0-only
  ([ADR-0015](decisions/0015-agpl-licence.md)). New deps must be AGPL-compatible.

## Gotchas / open threads

- **Staging migrations are manual**: after any new `drizzle/` migration, run `pnpm db:migrate`
  against Neon's unpooled URL (DEPLOYMENT.md step 4) *before* merging code that needs it.
- Neon URLs may carry `channel_binding=require`; postgres.js forwards it as a startup param.
  It works on Vercel today; if staging ever reports `db:"down"`, strip it in `client.ts`.
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
- **Check exit codes, not output text** (Biome's ANSI output hides failures; use `NO_COLOR=1`).

## Resume command

```
cd D:/Work/claude-apps/networth-tracker && git switch main && git pull && gh issue list -m "M1 Identity & crypto core" -s open
```
