# ADR-0030 — Household key after unlock; confirming who added you

**Status:** Accepted · 2026-09-27 · issue #63 (split from #52) · builds on [ADR-0024](0024-lock-unlock-session.md), [ADR-0025](0025-onboarding-flow.md), [ADR-0029](0029-ending-an-invite.md)

## Context

Unlock put only the identity in the key session; the household key came from first run
alone. A returning member, or anyone after auto-lock, had no household key. An invitee
must also compare the code of whoever wrapped the key to them before using it (ADR-0025),
because the server chose which public key did the wrapping.

## Decision

- **A household gate** (`src/features/household/`) sits between unlock and the app. It
  is mounted only while unlocked, so it runs after every unlock: `GET /api/households`,
  then the caller's own wrap from `GET …/members`, then unwrap. The app renders only once
  the key is in the session.
- **Whose wrap is it?**
  - Sender = self (creator's self-wrap) → install.
  - Sender = someone else, and this device has confirmed that sender's fingerprint
    for this household → install.
  - Otherwise → *Check who added you*: the sender's code, **Yes** or **No**.
- **Remembering the confirmation:** `localStorage["nwt.trusted-senders"]` maps
  `householdId → fingerprint`. These are public-key fingerprints, not secrets, and the
  value is per device: a new device asks once more. If storage is off, the member is
  asked each unlock, which is safe.
- **No** drops the unwrapped key (it never reaches the session or React state; a pending
  key waits in a ref) and shows the stop message.
- **Waiting to join:** no household but an open invite → the invitee's own code and the
  inviter's name, polling every 5 s; after 10 min, "Still waiting".

## Consequences

- **By the time the invitee can check the code, they have already been added**, so **No**
  can't un-add them; they just never get the key. A "leave household" endpoint, or
  showing the inviter's key on the waiting screen before the add, would close this. Left
  for a follow-up.
- A follow-up could have the member re-wrap the key to themselves after **Yes**, so no
  device ever needs to ask again.
- A wrap that doesn't open (tampered, or meant for someone else) shows an error; nothing
  is installed.
