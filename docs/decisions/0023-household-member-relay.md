# ADR-0023 — Household member relay and in-app invite

**Status:** Accepted · 2026-09-27 · issue #43 (split from #38) · builds on [ADR-0019](0019-household-key-wrapping.md), [ADR-0020](0020-auth-invite-only-otp-passkeys.md), [ADR-0021](0021-household-authorisation.md), [ADR-0022](0022-identity-vault-relay.md)

## Context

ADR-0019 wraps the HDK to each member's identity public key on the client. The server has
to carry those wraps between members, and it has to let a member bring in a spouse who may
not have an account yet. The server can't read or forge a wrap. What it controls is
*which public key* a member is given to wrap to, and *which user* receives the wrap.

## Decision

- **Create:** `POST /api/households {id, wrappedHdk}`. The client picks the id, because
  the wrap's HKDF info is bound to it. The caller must already have a vault (else `409`).
  The member row's `public_key` is **copied from the caller's vault**, never taken from
  the body. A taken id is `409`. Ids are random UUIDv4, so this is not a practical
  existence oracle.
- **Invite:** `POST /api/households/:id/invites {email}` writes a `household_invites` row
  (household, SHA-256 email hash, inviter, 14-day expiry; migration `0006`) and opens or
  extends the ADR-0020 sign-up invite, so a newcomer can sign in by OTP. The email travels
  only in a POST body, never in a URL (access logs). No mail is sent; the inviter tells the
  invitee.
- **Find the invitee:** `GET …/invites` lists open invites. `invitee {userId, email,
  publicKey}` is filled in once an account whose normalised email hashes to the invite
  exists *and* has a vault. Postgres recomputes the hash:
  `sha256(convert_to(lower(btrim(normalize(email, NFKC))), 'UTF8'))`. Binding invites to
  a household means a member can only look up people their own household invited, not
  probe any address for an account.
- **Relay:** `POST …/members {userId, wrappedHdk}` works only for an open invite of this
  household whose account has a vault. The row's `public_key` again comes from that vault.
  The invite is consumed in the same transaction. A second add is `409` (already a member)
  or `404` (invite gone).
- **Read:** `GET …/members` → the caller's own `wrappedHdk` and every member's `{userId,
  publicKey, joinedAt}`. Other members' wraps are never returned.
- All `…/:id/…` routes run `guardHousehold` first (401 / identical 404). Bodies are JSON
  (`415` otherwise), ≤ 4 KiB (`413`), with exact keys. Wraps are checked for shape only:
  v1 byte, 123–378 bytes.

## Consequences

- A malicious server can still hand the inviter its own key: the vault key is immutable
  (ADR-0022), but the server chooses which vault it serves. **Comparing `keyFingerprint`
  out of band stays mandatory** in the invite UI.
- Any member can invite (no roles yet). A household of two doesn't need roles; revisit
  with M8 hardening.
- In-app invite routes aren't rate-limited yet (Better Auth's limiter covers only
  `/api/auth`); an invite needs a member session. Left for M8 hardening.
- Staging needs migration `0006_household_invites` (manual, DEPLOYMENT S4).
