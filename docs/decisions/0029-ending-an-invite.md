# ADR-0029 — Ending an invite: inviter's name, cancel, decline

**Status:** Accepted · 2026-09-27 · issue #52 (split: client in #63, #64) · builds on [ADR-0023](0023-household-member-relay.md), [ADR-0025](0025-onboarding-flow.md)

## Context

ADR-0025's joining flow has a live code check on both sides, and a mismatch on either
side must cancel the invite. The waiting invitee also needs to know who they're waiting
for. ADR-0023 only let an invite end by being consumed when the member row is written.

## Decision

- **`GET /api/households` lists the caller's open invites** as `{ householdId, invitedBy }`.
  `invitedBy` is the inviter's display name, or their email when the name is empty (OTP
  sign-up leaves it blank). The invitee already knows this person, so nothing new leaks.
  `invited` stays for first run.
- **Inviter cancels:** `DELETE /api/households/:id/invites {emailHash}`, behind the
  ADR-0021 guard. `404` if there's no such invite, which a member may know anyway since
  `GET …/invites` lists them.
- **Invitee declines:** `DELETE /api/households/:id/invite` deletes the invite matching
  the caller's own email hash for that household. **Always `204`**, including for a
  malformed id, so it can't be used to probe which households exist or invited whom.
- **Email hashes travel only in request bodies.** A SHA-256 of an email is guessable
  (emails are low-entropy), so it's handled like the address: never in a URL, where
  proxies and access logs would keep it.
- The ADR-0020 sign-up invite is left alone on cancel or decline. It only allows an
  account to exist and expires on its own.

## Consequences

- A cancelled or declined person can be invited again with a fresh `POST …/invites`.
- Nothing is rate-limited yet (as ADR-0023); left for M8 hardening.
