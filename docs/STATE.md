# State — read me first

_Last updated: 2026-09-26 (session 4, #4 in review) · next session: start here_

## Where we are

**Milestone:** M1 — Identity & crypto core. M0 complete (PRs #18-#22).

- #3 crypto primitives merged (PR #24): `kdf.ts`, `aead.ts`, `keys.ts`, KATs,
  [ADR-0013](decisions/0013-crypto-primitives-and-envelope.md).
- **#4 identity vault** on branch `feat/identity-vault`, PR open, **awaits owner approval**
  (`area:crypto`). [ADR-0018](decisions/0018-identity-vault-and-recovery-code.md):
  - `src/crypto/vault.ts`: `createIdentity`, `unlockWithPassphrase`, `changePassphrase`,
    `restoreWithRecoveryCode`, `rotateRecoveryCode`; vault = `{v, publicKey, kdf,
    byPassphrase, byRecovery}` (GCM `wrapKey` pkcs8, AAD binds slot + public key)
  - `src/crypto/recovery.ts`: 24 BIP-39 words (`@scure/bip39`, MIT) → HKDF → AES-GCM key
  - `aead.ts` gained `encodeEnvelope`; `keys.ts` exports `P256`

Green on the branch: `pnpm test` (42) · `typecheck` · `check`.

## Next session picks up

**Issue #5: household + HDK** once #4 is merged (create, wrap to self, invite/accept;
fix HKDF salt/info strings; add `records`→households FK). Brief: `docs/phases/M1.md`. Then #6
(auth; also owns the vault's JSON/wire encoding + bounding stored KDF params), #7 (lock UX).

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
- `records` has no FK to households yet; add it with #5.
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
cd D:/Work/claude-apps/networth-tracker && git switch main && git pull && gh issue view 5
```
