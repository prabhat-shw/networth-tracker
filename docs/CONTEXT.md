# Context & token framework

This project is built in many short sessions on a limited token budget. Context is treated
as an engineering constraint, not an afterthought.

**The rule:** a fresh session must do useful work after reading ~3 small files, and must
never need to read the whole repo.

## Committed memory, with enforced size caps

`pnpm check:docs` (run in CI) fails the build if a cap is breached.

| File | Cap | Purpose | Read when |
| --- | --- | --- | --- |
| `CLAUDE.md` | 120 lines | Working agreements + invariants | Every session |
| `docs/STATE.md` | 80 lines | Handoff: where we are, what's next, gotchas | Every session |
| `docs/phases/M<N>.md` | 150 lines | Scope, files, acceptance for one milestone | Current phase only |
| `docs/decisions/NNNN-*.md` | 60 lines | One decision + why | When touching that area |
| `docs/SESSION_LOG.md` | 1 line/session | Cheap history | Rarely |
| `docs/PLAN.md` | — | The full map | On demand |

`docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/UX.md`, `docs/api/CONTRACT.md`,
`docs/DEPLOYMENT.md` are reference docs — linked from phase briefs, read only when the issue touches them.

## Code layout is a context strategy

- Feature folders; files ≤300 lines; colocated tests; no barrel files.
- `src/domain`, `src/crypto`, `src/parsers` are framework-free, so they can be reasoned
  about without loading UI context.
- If a change needs more than ~6 files open, **the issue was too big** — split it.

## The session loop

1. **Open** — `CLAUDE.md`, `docs/STATE.md`, `docs/phases/M<N>.md`, `gh issue view <N>`.
   That is the entire warm-up. (`/start-session` does it.)
2. **Work** — one issue, one branch. Search with grep/glob; read with line ranges; never
   dump a file over ~200 lines. Batch independent tool calls into one message.
3. **Verify** — targeted tests (`pnpm vitest run src/domain/goals`); CI runs the full suite.
4. **Close** — PR with `Closes #N`, rewrite `docs/STATE.md`, append to
   `docs/SESSION_LOG.md`, move the card to *In review*. **Then stop.** (`/handoff` does it.)

## Budget discipline

- Issue sizing, enforced at filing time: `size:S` ≤ 3 files · `size:M` ≤ 6 files ·
  `size:L` **must be split before work starts**. One session = one S or M issue.
- Target ≤ ~60k tokens of context per session. If a session passes ~75% of the window,
  **write the handoff and stop** rather than riding auto-compaction into a lossy state.
- Never paste large output back: pipe through `head`/`tail`, prefer `--quiet`.
- Never re-read a file just to confirm an edit landed — the tooling errors if it did not.
- No subagents unless the owner asks; each one re-derives context from cold.
- Anything a future session needs goes into `STATE.md` or an ADR **now**, not into chat.

## Handoff template (`docs/STATE.md`)

Current milestone · last issue closed + PR · **next issue to pick up** · decisions made
this session (ADR links) · known gotchas / half-finished threads · exact resume command.
