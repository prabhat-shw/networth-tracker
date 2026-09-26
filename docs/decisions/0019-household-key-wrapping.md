# ADR-0019 — Household data key wrapping and member rows

**Status:** Accepted · 2026-09-26 · refines [ADR-0002](0002-key-hierarchy-and-sharing.md),
settles the HKDF strings left open by [ADR-0013](0013-crypto-primitives-and-envelope.md)

## Context

Issue #5: a household has one data key (HDK) that every member must hold, and the server
must be able to relay it to an invitee without being able to read, forge or redirect it.

## Decision

- **HDK** = random AES-256-GCM (`generateDataKey`), key id **`hdk:1`**; a future rotation
  issues `hdk:2`, … Every record envelope carries the kid (ADR-0013), so old and new
  records can coexist during a rotation.
- **Wrap = static-static ECDH** between the sender's and the recipient's identity keys
  (not an ephemeral key), so the recipient learns *who* wrapped it: only the holder of
  either private key could have produced a blob that unwraps. The creator's own copy is the
  same construction with sender = recipient.
- **KEK** = AES-KW key from HKDF-SHA-256 with a **random 16-byte salt per wrap** and
  **info = `nwt/hdk-wrap/v1|<householdId>|<kid>|` ‖ senderPub ‖ recipientPub**. The info
  binds the blob to one household, one key id and one sender→recipient pair; a blob moved
  to another household or member fails. The salt keeps repeated wraps unlinkable.
- **Blob bytes (v1):** `[0x01][senderPub:65][salt:16][kidLen:u8][kid][AES-KW(HDK):40]`.
  Every failure is `DecryptError`.
- **Key fingerprint** = first 80 bits of SHA-256(public key), five groups of 4 hex. The
  inviter checks the invitee's fingerprint (and vice versa) in person or on a call before
  wrapping: this is the defence against a server that substitutes its own public key.
- **Server tables:** `households (id, created_at)` and `household_members (household_id,
  member_id, public_key, wrapped_hdk, created_at)`; `records.household_id` now has an FK to
  `households` (cascade). No names, no roles, nothing readable. The invite *is* the member
  row the inviter writes; the relay endpoints and `member_id` → user FK arrive with #6.

## Consequences

- Removing a member means rotating the HDK (new kid, re-wrap to the rest, re-seal records
  lazily); planned, not built.
- Leaking either party's identity key exposes that pair's wraps — same exposure as the
  identity itself, so no new risk.
- Fingerprint comparison needs UI copy and a screen (lock/invite UX, #7 and M3).
- Staging needs `pnpm db:migrate` (migration `0001_households`) before this merges.
