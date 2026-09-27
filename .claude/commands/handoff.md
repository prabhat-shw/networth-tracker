---
description: Close out the session cleanly for the next one
---

Close the session, following `docs/CONTEXT.md`:

1. Run the targeted tests plus `pnpm typecheck` and `pnpm check`. Fix or report failures.
2. **Docs impact.** Read the ownership table in `docs/kb/07-keeping-docs-current.md`. For
   every row, decide: does this change make that doc wrong or incomplete? Update each one
   that it does (always `CHANGELOG.md` for a user-visible change; `docs/kb/` + GLOSSARY for
   a new concept). In the report, list the docs updated and the ones checked and left alone.
3. Commit (Conventional Commits, **no AI attribution**), push the branch, open the PR with
   `Closes #<N>`. The body **is** `.github/pull_request_template.md`, filled in, every box
   ticked honestly (an unticked box says why). Internal-only change (tests, CI, refactor):
   add the `no-changelog` label, or CI fails.
4. Rewrite `docs/STATE.md` (≤80 lines): current milestone · last issue + PR · **next issue
   to pick up** · decisions made (link ADRs) · gotchas / half-finished threads · resume
   command.
5. Append one line to `docs/SESSION_LOG.md`.
6. Add an ADR if a decision was made; update `docs/PLAN.md` if scope changed.
7. Report to the user: what shipped, what is next, anything they must do (e.g. `gh auth
   refresh`, merge the PR, verify on the phone). Then stop — do not start the next issue.
