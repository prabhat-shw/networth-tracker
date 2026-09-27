# ADR-0031 — Inviter's Household panel and code check

**Status:** Accepted · 2026-09-28 · issue #64 (split from #52) · builds on [ADR-0023](0023-household-member-relay.md), [ADR-0025](0025-onboarding-flow.md), [ADR-0029](0029-ending-an-invite.md), [ADR-0030](0030-household-key-after-unlock.md)

## Context

The invitee could wait and confirm (ADR-0030), but nobody could invite or add them from
the app. UX.md §3.8 is the full Household & Sharing screen; the Home nudge needs Home
(M3). The owner asked for a minimal panel now.

## Decision

- **A minimal Household panel** (`src/features/household/household-panel.tsx`) on the
  unlocked page, inside the household gate: members, open invites, an **Invite member**
  field (`POST …/invites`). It grows into §3.8 later.
- **Rows:** members read *You* or *Member* with `🔑 Has access`. The members API has no
  names yet, and adding one is not needed to add someone safely. Open invites show
  `⏳ Invite pending` (no account yet, so only a hash is known) or `🔑 Ready to add` with
  the invitee's email, which the server already returns for ready invites.
- **Code check:** *Ready to add* opens a sheet with the invitee's code and the inviter's
  own code (§3.0 C).
  - **It matches** wraps the HDK to **the same public-key bytes the shown code was
    computed from**, and sends `POST …/members`. The server checks that key against the
    invitee's vault again.
  - **It doesn't match** wraps nothing, cancels the invite (`DELETE …/invites`, ADR-0029)
    and shows the red *Stop* message. A new invite is needed.
  - **Not now** closes the sheet and does nothing; the invite stays *Ready to add*.
- The household key and identity are read from the key session only when *It matches*
  is pressed; they never enter React state (ADR-0024).

## Consequences

- Browser tests (real WebCrypto) cover this: no `add` call before *It matches*, the wrap
  opens for the invitee and names the inviter as sender, and a mismatch cancels and never
  adds.
- Members are not named yet. §3.8 needs a display name per member, and that means an API
  change later.
- There is no expired-invite row or *Resend*, because expired invites are not listed.
  Inviting the same email again extends the invite.
