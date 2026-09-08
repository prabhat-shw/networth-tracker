# State — read me first

_Last updated: 2026-09-08 · session 1_

## Where we are

**Milestone:** M0 — Foundation (complete except #1 and #2)

Merged to `main`:
- **#8** ADR-0008 branching policy + pre-push hook blocking direct pushes to `main`
- **#9** Build identity (ADR-0009): `/api/version`, build badge, stale-build reload banner
- **#10** UX design spec (`docs/UX.md`) + clickable prototype (`docs/ux/prototype.html`)

Also in place: Next.js 16 + TS strict + Tailwind v4 + Biome scaffold, `src/domain/money.ts`
(integer paise, Indian formatting), Docker Compose (app + Postgres + Caddy), CI (doc caps,
typecheck, Biome, Vitest, gitleaks, `pnpm audit`), ADRs 0001–0009, issues #1–#7.

Verified green: `pnpm test` (12) · `pnpm typecheck` · `pnpm check` · `pnpm check:docs`
`/api/version` returns the running commit's short SHA.

## Next session picks up

**Issue #1 — Drizzle + Postgres wiring and health check** (`size:M`). Unblocks all of M1.
Then #2 (Vercel staging), then M1 from #3 (crypto primitives) — brief in `docs/phases/M1.md`.

## Gotchas / open threads

- **Owner action:** `gh auth refresh -s project,read:project` for the Projects board.
  Milestones + labels are the board until then.
- **Enforcement is local only.** `git config core.hooksPath .githooks` on every clone —
  server-side branch protection needs GitHub Pro on a private repo (403 from the rulesets API).
- **Merge policy (owner, 2026-09-08):** merge PRs yourself once CI is green; only core
  features wait for the owner's approval.
- `docs/` is excluded from Biome — the UX prototype is a design artefact, not app code.
- `next dev` appends a Next.js agent-rules block to `CLAUDE.md`; it is committed on purpose.
- CI's dependency scan is `pnpm audit`; OSV-Scanner needs Advanced Security. Revisit in M8.
- Money is integer **paise** everywhere — use `src/domain/money.ts`, never a float.
- **Verification discipline:** always check a command's exit code. Biome's ANSI-coloured
  output split a "Found 1 error" line and a grep-based check missed a real failure once.

## Resume command

```
cd D:/Work/claude-apps/networth-tracker && gh issue view 1
```
