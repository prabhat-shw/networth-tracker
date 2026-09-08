# State — read me first

_Last updated: 2026-09-08 (end of session 1) · next session: start here_

## Where we are

**Milestone:** M0 — Foundation (complete except issues #1 and #2)

Merged to `main` this session:

| PR | What landed |
| --- | --- |
| #8 | ADR-0008 branching policy + `.githooks/pre-push` blocking direct pushes to `main` |
| #9 | Build identity (ADR-0009): `/api/version`, build badge, stale-build reload banner |
| #10 | UX design spec (`docs/UX.md`) + clickable prototype (`docs/ux/prototype.html`) |
| #11 | Knowledge base (`docs/kb/`) + enforced doc freshness (links, ADR hygiene, generated README block, `src/` ⇒ `STATE.md` rule) |

Foundation in place: Next.js 16 + TS strict + Tailwind v4 + Biome, `src/domain/money.ts`
(integer paise, Indian formatting), Docker Compose (app + Postgres + Caddy), CI, ADRs 0001–0009,
issues #1–#7.

Green at session end: `pnpm test` (12) · `typecheck` · `check` · `check:docs` · `docs:check`.
`/api/version` verified against `git rev-parse --short HEAD`.

## Next session picks up

**Issue #1 — Drizzle + Postgres wiring and health check** (`size:M`). Unblocks all of M1.
Then #2 (Vercel staging), then M1 from #3 (crypto primitives) — brief in `docs/phases/M1.md`.

## In flight — deal with this first

A background design agent was extending the prototype with **net-worth insights and
projections** (contribution vs growth, XIRR, real net worth, liquidity ladder, concentration,
loan burn-down; P10/P50/P90 projection fan, scenario sliders, FI date). It had not reported
back when the session ended.

- Its work lands in the **main working tree on branch `docs/ux-insights`**, which already
  carries a committed `docs: refresh state after M0 merges and widen M5 scope`.
- **Check `git -C D:/Work/claude-apps/networth-tracker status` first.** If `docs/UX.md` and
  `docs/ux/prototype.html` have changes, review them, commit on that branch, open a PR.
  If the tree is unchanged, the pass did not complete — re-run it.
- That branch's STATE edit will conflict with this file; keep **this** version and re-apply
  anything still true.

## Gotchas / open threads

- **Owner actions:** `gh auth refresh -s project,read:project` (Projects board);
  `git config core.hooksPath .githooks` on every clone.
- Branch protection is **local only** — GitHub Pro is required for rulesets on a private repo.
- Merge policy (owner): merge PRs yourself when CI is green; only core features wait for approval.
- A scratch worktree exists at `…/scratchpad/kb` (branch `docs/session-1-handoff`). Remove with
  `git worktree remove` once merged.
- `docs/` is excluded from Biome; `next dev` appends an agent-rules block to `CLAUDE.md` (committed on purpose).
- Money is integer **paise** — use `src/domain/money.ts`, never a float.
- **Check exit codes, not output text.** Biome's ANSI colouring hid a real failure from a grep once.

## Resume command

```
cd D:/Work/claude-apps/networth-tracker && git status && gh issue view 1
```
