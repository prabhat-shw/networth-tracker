# ADR-0008 — Branching, review and merge policy

**Status:** Accepted · 2026-09-08

## Context

Work happens in many short sessions (`docs/CONTEXT.md`), often unattended by the owner. A
mistake pushed straight to `main` would be the state a future session builds on. The owner
also wants a real review surface — a diff per unit of work — rather than a linear stream of
commits.

The M0 bootstrap commits landed directly on `main` because the repository did not exist yet
and had no branch to protect. That is the only exception, and it is closed by this ADR.

## Decision

- `main` is protected and always deployable. **No direct commits or pushes**, including by
  the owner and by Claude.
- One issue → one branch → one PR → squash-merge with `Closes #N`. Branch names:
  `phase-<n>-<slug>` for milestone work, `feat/`, `fix/`, `chore/`, `docs/` otherwise.
- CI (docs caps, typecheck, Biome, unit tests, gitleaks, dependency audit) must be green
  before merge. Security-relevant PRs (`area:crypto`, `area:security`) additionally need the
  owner's explicit approval — Claude never self-merges those.
- Non-security PRs may be merged once CI is green, mirroring the owner's paisa-diary flow.
- **Feature branches are not deleted on merge**; chore/docs branches may be.
- Enforcement is layered: a `.githooks/pre-push` hook rejects pushes to `main` locally
  (`git config core.hooksPath .githooks`, run once per clone), plus a server-side ruleset
  where the GitHub plan allows it.

## Consequences

- Every change is reviewable as a diff, and a bad session is one `gh pr close` away from
  being discarded.
- Slightly more ceremony per session; acceptable, and it is what `/handoff` automates.
