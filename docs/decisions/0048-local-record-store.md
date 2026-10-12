# ADR-0048 — Local record store: ciphertext in IndexedDB, plaintext in memory

**Status:** Accepted · 2026-10-12 · issue #116 · builds on [ADR-0045](0045-sync-versioning-cursor-limits.md), [ADR-0047](0047-record-plaintext-format.md), [ADR-0024](0024-lock-unlock-session.md)

## Context

The app works offline, so each device keeps its own copy of the household's records, its
unsent edits and its sync position. Disk is the weak point on a stolen device, while memory
is cleared on lock. The sync engine (#117) needs a store it can drive without knowing about IndexedDB.

## Decision

- **Dexie** (Apache-2.0, AGPL-compatible) over IndexedDB, in one database, `nwt-records`, shared
  by every household on the device. Its three tables are keyed by household:
  - `envelopes [householdId+id]`: the newest sealed envelope per record, with its `seq`.
  - `outbox [householdId+id]`: at most one pending write per record (the latest edit), with
    `queuedAt` for push order.
  - `meta [householdId]`: the pull cursor.
- **Ciphertext only.** Rows are built field by field from a `SealedRecord` (`id, version,
  deleted, ciphertext`) plus routing (`householdId, seq, queuedAt, cursor`). A caller that
  passes a decrypted record by mistake still stores only those fields.
- **Nothing moves backwards.** An older envelope never replaces a newer one, so the stored
  version is the replay floor passed to `decodeRecord` (ADR-0047). The cursor only advances.
  `dequeue(id, version)` removes a queued write only if no newer edit replaced it.
- **Plaintext lives in memory only**, in `createRecordCache(session)`. It follows the key
  session and empties as soon as the status leaves `unlocked` (lock, auto-lock, a new
  unlock). While locked it refuses writes, so a decrypt that finishes after a lock cannot refill it.
- `clear()` forgets one household (sign-out or leaving, wired in #117/#118).
- The E2E leak scan allows `nwt-records` next to `nwt-device`, and searches its rows for every secret.

## Consequences

- A stolen, locked device yields ciphertext, record counts and versions (the same metadata as
  the server), but no content.
- Searching or indexing record content must happen in memory after unlock. A persistent
  plaintext index is ruled out.
- One database per device means two accounts in the same household share envelopes. Both can
  already decrypt them.

## Alternatives rejected

- **Raw IndexedDB:** the device slot uses it, but transactions over three tables with compound
  keys are clearer in Dexie, which the plan already chose.
- **Caching plaintext in IndexedDB under a session key:** it saves a decrypt pass on unlock,
  but it adds a key to manage. Decrypting hundreds of small records takes milliseconds.
