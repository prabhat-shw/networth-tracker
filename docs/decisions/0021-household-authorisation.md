# ADR-0021 — Authorisation: household membership guard

**Status:** Accepted · 2026-09-27 · issue #37 (split from #6) · builds on [ADR-0019](0019-household-key-wrapping.md), [ADR-0020](0020-auth-invite-only-otp-passkeys.md)

## Context

Encryption keeps the server from reading data, but the server still decides who may
*download* a household's ciphertext. A signed-in user of household A must not be able to
pull household B's records, even though they could not decrypt them: ciphertext volume
and version history leak activity, and defence in depth is the product.

## Decision

- **Membership is the permission.** A user may act on a household iff a
  `household_members` row `(household_id, member_id = user.id)` exists. No roles yet.
- `household_members.member_id` gets an **FK to `user.id`, `ON DELETE CASCADE`**
  (migration `0004_member_user_fk`): deleting an account drops its memberships and wraps.
- **One guard, `guardHousehold`** (`src/server/guard.ts`), called first by every
  household-scoped route. It takes the DB and a `sessionUser(headers)` resolver, so tests
  drive it with real Better Auth sessions on PGlite.
- **Responses:** no or invalid session → `401`. Not a member, household missing, or
  malformed id → identical `404 {"error":"not found"}`. The API is not an oracle for which
  household ids exist. `403` is never used.
- **First guarded route:** `GET /api/households/:householdId/records?since=<version>` →
  `{ records: RecordEnvelope[] }`, ascending version, 500 per page, ciphertext base64url,
  `cache-control: no-store`. It is the read half of sync; M2 may fold it into
  `/api/sync/pull` behind the same guard.

## Consequences

- Household id travels in the path, so a user in several households picks one per call.
- A member row requires an existing user: the invite relay (#38) must create the member
  row only after the invitee has an account.
- Staging needs migration `0004_member_user_fk` (manual, DEPLOYMENT S4). It fails if any
  `household_members` row points at a non-existent user; staging has none.
- The isolation test (`records.pg.test.ts`) is the regression gate for this ADR.
