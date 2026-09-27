# ADR-0025 — Onboarding: sign-in, first run, joining with a code check

**Status:** Accepted · 2026-09-27 (owner, #50; iterate as #45 is built) · spec in [UX.md §3.0](../UX.md) · builds on [ADR-0017](0017-tap-budgets.md), [ADR-0018](0018-identity-vault-and-recovery-code.md), [ADR-0020](0020-auth-invite-only-otp-passkeys.md), [ADR-0023](0023-household-member-relay.md)

## Context

#45 builds the path from an email address to an unlocked app, but no spec existed for it.
This is the one flow where the product's security depends on the user doing something
right: saving a recovery kit and checking a key fingerprint with another person.

## Decision

- **The app routes, the user doesn't choose.** After sign-in: a vault exists → Unlock;
  none → first run. After first run: an open household invite → *Waiting to join*;
  none → the household is created silently (principle 8: don't ask).
- **Email code auto-submits** on the 6th digit. The "code sent" message is the same for
  every address (no account or invite oracle).
- **Passphrase:** one field with show/hide, no repeat field, minimum 12 characters,
  guidance towards 4+ words rather than composition rules.
- **Recovery kit:** 24 words, Download PDF / Print, **no Copy** (clipboard sync).
  Confirmed by typing two requested words. **The vault is uploaded only after that
  confirmation**, so an abandoned first run leaves nothing half-made on the server.
- **Passkey offer** after first run is for sign-in only and says so; unlock by passkey is #48.
- **Joining needs a live code check both ways:** the inviter confirms the invitee's
  `keyFingerprint` before wrapping; the invitee confirms the inviter's (the wrap's sender
  key) before using the HDK. A mismatch on either side keeps nothing and cancels the invite.
- **New tap budgets:** returning with passkey 2; email sign-in 1; first run 4; invitee
  joining 1; inviter adding from Home 2.

## Consequences

- #45 needs three API additions: list my households, tell an invitee they have an open
  invite (and from whom), cancel an invite. #45 is likely over 6 files: split it into
  sign-in + first run, and joining.
- Fingerprint checks cost a phone call. That's accepted: it is the only defence against a
  server that swaps keys (ADR-0023).
