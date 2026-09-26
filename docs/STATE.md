# State — read me first

_Last updated: 2026-09-26 (session 5, #5 in review) · next session: start here_

## Where we are

**Milestone:** M1 — Identity & crypto core. M0 complete (PRs #18-#22).

- Merged: #3 primitives (PR #24, [ADR-0013](decisions/0013-crypto-primitives-and-envelope.md)),
  #4 identity vault (PR #35, [ADR-0018](decisions/0018-identity-vault-and-recovery-code.md)).
- **#5 household + HDK** on `feat/household-hdk`, PR open, **awaits owner approval**
  (`area:crypto`). [ADR-0019](decisions/0019-household-key-wrapping.md):
  - `src/crypto/household.ts`: `createHousehold` (HDK kid `hdk:1`, self-wrap),
    `wrapHouseholdKey` (invite), `unwrapHouseholdKey` (accept; returns sender pubkey),
    `keyFingerprint` (80-bit safety number). Static-static ECDH, random salt, info binds
    household + kid + both public keys.
  - Schema: `households`, `household_members` (public_key, wrapped_hdk), FK
    `records.household_id` → households. Migration `drizzle/0001_households.sql`.

Green on the branch: `pnpm test` (50) · `typecheck` · `check`.

## Next session picks up

**Issue #6: auth** (Better Auth, passkeys + email OTP, invite-only; `area:security`).
Also owns: relay endpoints for member rows, `member_id` → user FK, the vault's JSON/wire
encoding, bounding stored KDF params, `docs/api/CONTRACT.md`. Then #7 (lock UX; blocked on
owner review of `docs/UX.md`).

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
- For a throwaway local stack, export `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `APP_ORIGIN`
  and use `docker compose -p nwt-e2e …` then `down -v`, so the real volume is never touched.
- **Before merging #5:** run `pnpm db:migrate` on Neon (unpooled URL) for `0001_households`.
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
cd D:/Work/claude-apps/networth-tracker && git switch main && git pull && gh issue view 6
```
