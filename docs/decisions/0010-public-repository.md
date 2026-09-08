# ADR-0010 — Public repository

**Status:** Accepted · 2026-09-08

## Context

The repository started private. That blocked GitHub's branch rulesets, which require a paid
plan on private repositories, leaving `main` protected only by a local pre-push hook
(ADR-0008) — enforcement that any fresh clone silently lacks.

The owner's judgement was that publishing the code costs nothing. The architecture supports
that: the security of this app rests on keys the server never sees (ADR-0001), not on the
code being secret. Publishing an implementation of a zero-knowledge design is normal and, if
anything, invites the review that makes it trustworthy.

Checked before flipping: no committed `.env`, no secrets in history (gitleaks runs on every
PR), no real financial data — the UX prototype's household is fictional.

## Decision

The repository is public. Server-side branch protection is now active on `main`:
pull request required, `verify` and `security` checks must pass, no force-push, no deletion.
Required approvals stay at zero, matching the owner's policy that green non-core PRs may be
merged without waiting.

**Licence deliberately deferred.** With no `LICENSE` file, default copyright applies — the
code is readable but not reusable. That is a safe default until the owner chooses (MIT if
reuse is welcome, AGPL if derivatives should stay open, or none).

## Consequences

- The local hook becomes a convenience; the server is now the real gate.
- CI logs and issues are public. No household data or secrets may ever enter them — already a
  standing rule, now with a wider audience.
- A public repo invites scrutiny of the crypto work in M1. That is a benefit, not a risk, but
  security-labelled PRs still require the owner's explicit approval.
