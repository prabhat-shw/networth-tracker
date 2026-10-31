_Last updated: 2026-10-31 (session 39: #140 M3 acceptance E2E) · next session: start here_

## Where we are

**Milestone:** M3 — Data model & manual entry (brief: `docs/phases/M3.md`). M0–M2 closed. M3's deadline scope is
done once #140 merges: pure layer (ADR-0052–0055), Add anything (#135/#136), Accounts (#137), Home + lens + sync
status (#138), Goals (#139), and the acceptance E2E (#140, `e2e/m3-acceptance.spec.ts`).
**Push needs a recovery method** (ADR-0040): a member without one has edits stuck in the outbox; Home surfaces it.

## Deadline plan (owner: app due 2026-11-01)

Ship a usable **manual-entry** app: M3 only. M4+ (prices, charts, import) and #25–#27, #112, #93 wait.
Day 2 left: **redeploy staging + home** (#147, #142 advisories). Run staging `pnpm db:migrate` first if needed.

## Next session picks up

1. If #140's PR is still open: it is `area:security`, so the owner approves before merge.
2. **Redeploy staging + home** (#147, #142). Smoke-test add FD → Home figure on a real phone (passkey PRF too).
3. Then M3 leftovers #25 nominees (`size:S`), #27 linked transfers (`size:S`), #26 tax lots (`size:M`), or close M3
   and move them to a later milestone (owner call).
#140 E2E: two named members, joint FD 50/50 + solo PPF via Add anything; asserts each lens on both devices
(A: Me ₹1,00,000, B: Me ₹1,50,000, Household ₹2,50,000), padding, leak scan of names/amounts/kinds, C gets 404.
It nudges sync with the probe's "Open records"; "Owned by" lists another member only after their profile syncs.
Deferred: a lens store shared by Home/Accounts/Goals, count-up animation.
Known gap (ADR-0054): a member can tombstone another's profile.

## Also open

- Insights UX: inflation 8% ([ADR-0014](decisions/0014-projection-defaults.md)), tap budgets
  ([ADR-0017](decisions/0017-tap-budgets.md)). #34's "Home fits one screen" settled in ADR-0059.
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
- **E2E (ADR-0035):** Playwright's 300 s webServer timeout can expire on a cold `next build`: build with the E2E env
  (`e2e/env.ts`) and `pnpm start -p 3100` first; `reuseExistingServer` picks it up locally.
  `docker compose -f compose.e2e.yml -p nwt-e2e up -d --wait`, `pnpm e2e`, then `down -v`
  (Docker Desktop running). CI: `.github/workflows/e2e.yml`, path-filtered. Windows reserved port 55432?
  Remap db via a local compose override (`ports: !override`) and set `E2E_DATABASE_URL`.
- **Social recovery (spouse re-wrap to a new identity) is not built:** the server refuses a vault
  public-key change (ADR-0022), so a member who lost every method cannot start over: #112 (size:L, ADR first).
- New household-scoped routes: call `guardHousehold` first; never answer 403 (ADR-0021).
- Server tests that touch SQL: use PGlite with the real migrations (`migratedDb()` from `db/test-db.ts`), not
  the Better Auth memory adapter, which hides schema bugs.
- Repo is **public** (ADR-0010); `main` protected (PR + green `verify`/`security`).
- Kanban: https://github.com/users/prabhat-shw/projects/2. Move cards as you go.
- **Merging:** `gh pr merge <N> --squash` works from this machine (runs as the owner's account) once checks are green.
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
- Browser tests: `render()` from vitest-browser-react is async; await it. `toHaveTextContent` timed out on
  matching text here: assert with `getByText(/…/)` instead. Python edits on Windows:
  open with `newline=''` or files turn CRLF.
- **Check exit codes, not output text** (Biome's ANSI output hides failures; use `NO_COLOR=1`).

## Resume command

```
cd D:/Work/claude-apps/networth-tracker && git switch main && git pull && gh issue list -m "M3 Data model & manual entry" -s open
```
