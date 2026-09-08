---
description: Close out the session cleanly for the next one
---

Close the session, following `docs/CONTEXT.md`:

1. Run the targeted tests plus `pnpm typecheck` and `pnpm check`. Fix or report failures.
2. Commit (Conventional Commits, **no AI attribution**), push the branch, open the PR with
   `Closes #<N>` using the PR template checklist.
3. Rewrite `docs/STATE.md` (≤80 lines): current milestone · last issue + PR · **next issue
   to pick up** · decisions made (link ADRs) · gotchas / half-finished threads · resume
   command.
4. Append one line to `docs/SESSION_LOG.md`.
5. Add an ADR if a decision was made; update `docs/PLAN.md` if scope changed.
6. Report to the user: what shipped, what is next, anything they must do (e.g. `gh auth
   refresh`, merge the PR, verify on the phone). Then stop — do not start the next issue.
