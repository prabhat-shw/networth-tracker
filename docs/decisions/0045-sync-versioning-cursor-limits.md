# ADR-0045 — Sync: record version, pull cursor, LWW clock and limits

**Status:** Accepted · 2026-10-12 · owner decision · issue #113 · amends [ADR-0003](0003-sync-protocol.md) (LWW clock) and [ADR-0001](0001-zero-knowledge-architecture.md) (server columns)

## Context

The AAD binds `recordAad(id, version)` (ADR-0013), so the client needs the version *before*
it seals. Pull, however, needs a household-wide monotonic cursor, and a per-record version is
not one. ADR-0003 also put the LWW clock in the server's `updatedAt`. M2 needs both settled,
along with the routes and limits, before any sync code is written (brief `docs/phases/M2.md`).

## Decision

- **Version is per record and client-set (option a).** A write seals at `version = base + 1`,
  where `base` is the version the client last saw (0 for a new record). The server applies it
  only if the stored version is `base` (no row when `base` is 0); otherwise the record is a
  conflict. Versions are integers 1 … 2^53−1.
- **A separate server `seq` is the pull cursor.** It's a bigint that is unique and
  increasing within a household, stamped on every applied write. It's kept in
  `households.record_seq`, and a push takes that row's lock first, so pushes to one household
  serialise and commit in `seq` order. A reader can therefore never see `seq` n+1 before n.
  `records` gains one opaque column, `seq`, with a unique index on `(household_id, seq)`.
- **LWW lives inside the plaintext.** Each record carries `modifiedAt` (client ISO time, ms)
  and `modifiedBy` (member user id). The later `modifiedAt` wins, and a tie goes to the
  greater `modifiedBy`. The server's `updatedAt` is informational only and never drives the merge.
- **Routes are household-scoped:** `GET` and `POST /api/households/:householdId/records`.
  Both run `guardHousehold` first (ADR-0021). `/api/sync/pull|push` is dropped.
- **Push is atomic, with a per-record outcome.** One transaction applies the whole push. Each
  record is either `applied`, with its `seq`, or a `conflict` that carries the server's
  current envelope. Before anything else, push calls `requireRecoveryMethod` (ADR-0040).
  Deletes are sealed tombstones (`deleted: true`, and the ciphertext is still required).
- **Limits:** at most 100 records per push, a body ≤ 4 MiB (the Vercel function cap, below
  100 × 64 KiB), and each decoded envelope ≤ 64 KiB. Pull pages stay at 500.
- **Padding:** before sealing, the client pads the plaintext to the next multiple of 256
  bytes (ISO/IEC 7816-4: `0x80`, then zeros, always ≥ 1 byte). The server checks the
  envelope's shape: the first byte is `0x01` and `len − 30 − kidLen` is a positive multiple of
  256. It reads nothing else. The wire spec is CONTRACT.md's *Records* section.

## Consequences

- Server record columns: `id, household_id, version, seq, updated_at, ciphertext, deleted`.
  The CLAUDE.md invariant now lists `seq`. Neither `seq` nor `version` reveals content. The
  number of writes per household was already visible.
- #114 migrates `records.seq` + `households.record_seq`: staging needs `pnpm db:migrate` first.
- Rollback protection stays: the AAD binds the version, so the client refuses an envelope
  whose version is lower than one it already holds (#115/#117).
- Device clock skew can make the "wrong" edit win; accepted as in ADR-0003. Sizes leak only
  to 256 B; a record over 64 KiB must be split by its type (M3).
- Record ids are global (`records.id` is the primary key). Pushing an id that belongs to
  another household gets `400`. This tells you such an id exists, but v4 UUIDs can't be
  guessed, and only a past member could know one.

## Alternatives rejected

- **(b) Version is the household sequence:** a round trip to reserve it; gaps on failure.
- **(c) Drop the version from the AAD:** a server could then replay an old envelope as current.
- **A Postgres `SEQUENCE` for the cursor:** transactions can commit out of order, so a puller
  could skip a lower `seq` that commits late.
- **Server-time LWW:** ties the merge to server state; no privacy gain.
