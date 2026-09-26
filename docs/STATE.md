# State — read me first

_Last updated: 2026-09-26 (session 3) · next session: start here_

## Where we are

**Milestone:** M1 — Identity & crypto core. M0 complete (PRs #18-#22).

Session 3 built issue #3 (crypto primitives) on branch `phase-1-crypto-core`. **The PR is open
and waits for the owner's approval** (`area:crypto`, never self-merge):

- `src/crypto/kdf.ts`: `deriveUnlockKey` (Argon2id via `hash-wasm`, m=64 MiB t=3 p=1,
  params returned with the key), `newKdfParams`, `argon2idBytes` (KAT only)
- `src/crypto/aead.ts`: `seal`/`open` (AES-256-GCM, v1 envelope with key id),
  `recordAad`, `DecryptError`
- `src/crypto/keys.ts`: P-256 identity keypair, public-key export/import, ECDH, HKDF,
  `deriveWrappingKey` (ECDH→HKDF→AES-KW), `generateDataKey`, `wrapDataKey`/`unwrapDataKey`
- Vectors in `src/crypto/__vectors__/kat.json` (PHC, Wycheproof, RFC 5869/3394/5903)
- Decisions: [ADR-0013](decisions/0013-crypto-primitives-and-envelope.md) (envelope bytes,
  AAD rules, GCM unlock key, NFKC passphrase)

Staging: **https://networth-staging.vercel.app** (Vercel project `networth-tracker-pxac`,
Neon in Singapore). Green on the branch: `pnpm test` (34) · `typecheck` · `check`.

## Next session picks up

If the #3 PR is merged: **Issue #4: identity vault** (keypair wrapped under the unlock key,
passphrase change, 24-word recovery kit; `size:M`, `area:crypto`). Brief: `docs/phases/M1.md`.
Then #5 (household + HDK; fixes HKDF salt/info strings), #6 (auth), #7 (lock UX).

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
- Crypto: never export a private key or HDK except via `wrapKey`; `open` failures are always
  `DecryptError` (no detail). `gh issue list -m` needs the full milestone title.
- **Check exit codes, not output text** (Biome's ANSI output hides failures; use `NO_COLOR=1`).

## Resume command

```
cd D:/Work/claude-apps/networth-tracker && git switch main && git pull && gh issue view 4
```
