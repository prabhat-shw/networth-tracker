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

## Recently landed

The **insights and projections** pass is complete (PR opened from `docs/ux-insights-final`):
an Insights destination with a *This year* state (contribution-vs-growth waterfall, XIRR,
allocation drift, liquidity ladder, concentration, loan burn-down, movers, data hygiene) and
a *Forecast* state (P10/P50/P90 fan, live Scenario Lab, FI and coast-FI, per-goal odds,
sensitivity, editable assumptions). The maths was verified by executing the prototype's own
script, not eyeballed.

**Needs the owner's judgement** (flagged in `docs/UX.md` §12.1 and editable in the prototype):
the per-asset-class P10/P50/P90 return assumptions, the 6% inflation and 4% withdrawal-rate
FI assumptions, and the decision to keep the fan deterministic rather than a true Monte Carlo.

The stale `docs/ux-insights` branch holds only a mid-write snapshot and is superseded — ignore it.

## Gotchas / open threads

- **No owner actions outstanding.** (`core.hooksPath` is set on this machine; repeat it only
  on a new clone.)
- Repo is **public** (ADR-0010); `main` is protected server-side: PR + green `verify`/`security`,
  no force-push, no deletion. Licence deliberately not chosen yet.
- Kanban board: https://github.com/users/prabhat-shw/projects/2 — columns Backlog / Ready /
  In progress / In review / Done. #1 and #2 sit in **Ready**; move your card when you start.
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
