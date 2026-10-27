_Last updated: 2026-10-13 (session 28: #118 sync wire-up, PR open) · next session: start here_

## Where we are

**Milestone:** M2 — Encrypted sync engine (brief: `docs/phases/M2.md`, issues #113–#118; all but #118 merged). M0 and M1 are closed.

- **Merged in M1** (details in the ADRs): crypto primitives (0013), identity vault (0018),
  household key (0019), auth (0020, `src/server/auth.ts`), membership guard (0021), vault
  relay (0022), member relay + invites (0023), key session + unlock (0024, `src/features/lock/`),
  onboarding spec (0025, UX.md §3.0), sign-in + gate (0026, `src/features/auth/`), first run
  (0027, `src/features/onboarding/`), `GET /api/households` (#56). Neon migrated through `0007`.
- Also merged in M1: restore, join API, household gate/panel, docs enforcement, passkey slots + fast unlock, E2E harness +
  probe, vault v3 + device slot, magic link, recovery before first data, silent first run, banner, app lock, Settings → Security,
  onboarding-v2 E2E (ADRs 0028–0044; `e2e/support.ts` has shared `profiles`/`expectNoLeaks`). **M2 push must call `requireRecoveryMethod`** (ADR-0040).

## Next session picks up

**#118** in review (branch `feat/sync-wireup`, `area:security`: owner approval needed), the last M2 issue. [ADR-0050](decisions/0050-sync-wire-up.md):
`startHouseholdSync({ session, userId })` (`src/sync/household-sync.ts`) wires store + cache + engine + scheduler; `SyncProvider`
(`src/features/sync/`) mounts inside `HouseholdGate`; screens use `useHouseholdSync()` / `useRecords()`. The E2E probe writes through the
engine (SQL insert gone, ADR-0036 amended); `e2e/m2-acceptance.spec.ts` covers offline → online push, LWW conflict, delete, padding, leaks.
Shared E2E flows: `e2e/household.ts` (`pairHousehold`, `seal`, `expectRecords`); `support.ts` is at the 300-line cap.
**Found:** a member without a recovery method (every joiner, silent first run) can edit but nothing pushes (`409`, ADR-0040); edits wait
in the outbox with no visible signal. Fold into M3's sync indicator, or prompt joiners. After merge: close M2, run the milestone docs
pass (kb/07 layer 4), then **write `docs/phases/M3.md`** (no brief yet; open M3 issues exist) before starting M3 work.
**Deps fix #142** (`fix/deps-audit`, `area:security`): next 16.4.2, zod floor override, vite 8.3.4 devDep; merge it
first, then merge `main` into #141 so its `security` job goes green. **Redeploy staging and the home server after #142**
(Next.js RCE, GHSA-p3m5-59mp-jv5r). The owner still has to redeploy the home server (H4). Open items: #112 social recovery (size:L, ADR first), #93 Google sign-in (M8),
inviter's Home nudge (UX.md §3.0), ADR-0030 leave-household, ADR-0031 member names. Green on the branch: `pnpm test` · typecheck · check · `pnpm e2e`.

## Also open

- Insights UX: inflation 8% ([ADR-0014](decisions/0014-projection-defaults.md)), tap budgets
  ([ADR-0017](decisions/0017-tap-budgets.md)). Leftovers in #34 (settle "Home fits one screen" before M3).
- Issue #14 decided: all six ideas accepted as #25–#32 on M3/M5/M7/M8
  ([ADR-0016](decisions/0016-features-borrowed-from-other-apps.md)); licence AGPL-3.0-only
  ([ADR-0015](decisions/0015-agpl-licence.md)). New deps must be AGPL-compatible.

## Gotchas / open threads

- **Passkey PRF** can't run in headless Chrome (tests fake `PrfApi`): verify fast unlock on a real phone.
- **Staging migrations are manual**: after any new `drizzle/` migration, run `pnpm db:migrate`
  against Neon's unpooled URL (DEPLOYMENT.md step 4) *before* merging code that needs it ("…already exists, skipping" NOTICEs are harmless).
- Neon URLs may carry `channel_binding=require`; if staging reports `db:"down"`, strip it in `client.ts`.
- **Vercel:** import the repo only once (a re-import made a duplicate project, since deleted).
  Env vars need a **Redeploy** to take effect. `APP_ORIGIN` = the staging URL (used from M1 auth).
- **Docker on Windows:** the image only builds because of the new `.dockerignore`; never
  remove `node_modules` from it. Docker Desktop must be running (`docker info`).
- **E2E (ADR-0035):** `docker compose -f compose.e2e.yml -p nwt-e2e up -d --wait`, `pnpm e2e`, then `down -v`
  (Docker Desktop running). CI: `.github/workflows/e2e.yml`, path-filtered. Windows reserved port 55432?
  Remap db via a local compose override (`ports: !override`) and set `E2E_DATABASE_URL`.
- **Social recovery (spouse re-wrap to a new identity) is not built:** the server refuses a vault
  public-key change (ADR-0022), so a member who lost every method cannot start over: #112 (size:L, ADR first).
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
- **Docs per PR (ADR-0032):** CI fails `src/` changes without `CHANGELOG.md` (label `no-changelog` for
  internal work); `/handoff` walks the kb/07 table; PR body = filled-in `.github/pull_request_template.md`.
- Two PRs in flight both append `SESSION_LOG.md` and regenerate the README block: after the first
  merges, merge `main` into the second, keep both log lines, `pnpm docs:sync`.
- New issues are not auto-added to the Kanban: `gh project item-add 2 --owner prabhat-shw --url …`.
- Browser tests: `render()` from vitest-browser-react is async; await it. Python edits on Windows:
  open with `newline=''` or files turn CRLF.
- **Check exit codes, not output text** (Biome's ANSI output hides failures; use `NO_COLOR=1`).

## Resume command

```
cd D:/Work/claude-apps/networth-tracker && git switch main && git pull && gh issue list -m "M2 Encrypted sync engine" -s open
```
