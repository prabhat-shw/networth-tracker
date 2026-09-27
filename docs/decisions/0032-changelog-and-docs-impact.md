# ADR-0032 — CHANGELOG in CI and a docs-impact pass at handoff

**Status:** Accepted · 2026-09-28 · issue #69

## Context

Only `docs/STATE.md` was enforced (CI fails if `src/` changes without it). Everything else
in the docs ownership table (`docs/kb/07-keeping-docs-current.md`) relied on memory.
`CHANGELOG.md` had no entries for all of M1 (about 15 feature PRs). In #64 the knowledge
base and CHANGELOG were updated only after the owner asked. Sessions read the table only
if they remember to, and PR bodies were written freehand, so the template's docs checkbox
was never seen.

## Decision

- **CI:** a PR that changes `src/**` must also change `CHANGELOG.md`. The `no-changelog`
  label skips the check for internal-only work (tests, CI, refactors). CI re-runs when
  labels change.
- **`/handoff` docs-impact pass:** walk every row of the kb/07 ownership table, update
  each doc the change makes wrong or incomplete, and report which docs were updated and
  which were checked and left alone.
- **PR bodies are the filled-in `.github/pull_request_template.md`**, every box ticked
  honestly or explained.
- CLAUDE.md's definition of done says the same.

## Consequences

- Only the CHANGELOG can be enforced mechanically. Whether the KB, UX, ARCHITECTURE or
  SECURITY docs are right needs judgement, so it stays a checklist, but one that
  `/handoff` makes explicit and the PR body makes visible.
- Adding `no-changelog` is a deliberate choice that shows on the PR.
