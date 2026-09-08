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

## In flight — check this first

A **cloud** design agent is completing the net-worth **insights and projections** pass
(contribution vs growth, XIRR, real net worth, liquidity ladder, concentration, loan
burn-down; P10/P50/P90 projection fan, scenario sliders, FI date, per-goal funding
probability). It runs on Anthropic infrastructure, not the owner's laptop, so it continued
after shutdown.

- It works on branch **`docs/ux-insights`** and opens a PR against `main` titled
  *"docs: net-worth insights and projections in the UX spec and prototype"*.
- That branch's head is a **mid-write snapshot** (`wip: snapshot of the in-progress...`)
  pushed before shutdown as insurance. The cloud agent was told to inspect, verify and fix it.
- **First action tomorrow:** `gh pr list`. If the PR exists, review it — check the maths
  reconciles with the household data and the embedded JS actually runs — then send the
  prototype to the owner before merging. If no PR exists, the run failed; re-run the pass.
- The branch also carries a superseded `docs: refresh state after M0 merges` commit whose
  STATE edit will conflict with this file. **Keep this version.**

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
