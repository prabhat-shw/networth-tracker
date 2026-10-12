# ADR-0049 — Sync engine: merge on arrival, bounded retries, tombstones kept

**Status:** Accepted · 2026-10-12 · owner decision (tombstones) · issue #117 · builds on [ADR-0045](0045-sync-versioning-cursor-limits.md), [ADR-0047](0047-record-plaintext-format.md), [ADR-0048](0048-local-record-store.md)

## Context

The engine sits between the household routes, the local store and the in-memory cache. It has
to converge after offline edits on several devices, survive a hostile or broken server, and
stop when the key is locked. The M2 brief asked for tombstone GC "once every device has
pulled past them", but no part of the system tracks devices.

## Decision

- **Pure engine** (`src/sync/engine.ts`) over an injected `Transport`, `LocalStore` and
  `RecordCache`. `httpTransport` is the real transport, and tests use an in-memory fake server.
- **A run** pulls every page after the cursor, then pushes the outbox in batches of 100.
  Concurrent `sync()` calls share one run.
- **A local edit** is sealed at the stored version + 1. A second edit before a push replaces
  the queued one.
- **Merge on arrival.** When a remote envelope (from a pull, or a push conflict) meets a
  pending edit of the same record:
  - If the pending edit was built on an older base, `mergeLww` decides. A local win is
    re-sealed at remote version + 1 and queued again; a local loss is dropped.
  - If the remote envelope is the pending edit's own base or older, the edit stands.
  - LWW decides only between *concurrent* writes. An edit made after this device has seen a
    delete builds on the tombstone, so it revives the record.
- **Bounded retries:** at most 3 push rounds per run. Anything still queued reports
  `pending: true`, and the next trigger continues.
- **Fail closed:** an envelope that does not decrypt is skipped and not stored, and it is
  counted as `rejected`. The cursor still moves past it, since retrying can't succeed, and the
  last good copy stays. A pull or push error rejects the run, and the outbox is kept.
- **Triggers** (`src/sync/scheduler.ts`): once right after unlock, on `online`, every 60 s
  while the page is visible, and when the page becomes visible. Locking clears the timer and
  the listeners. The engine needs the HDK on every step, so a run caught by a lock stops with `LockedError`.
- **Tombstones are kept (owner decision).** They stay as sealed 256-byte envelopes on the
  server and the device, because they are the conflict base and the replay floor. Deleted
  records are never held as plaintext. Purging needs per-device cursors on the server, and
  that is deferred to a later issue.

## Consequences

- Storage grows by about 300 bytes per deleted record, forever until a purge exists. That's
  negligible for a household.
- Device clock skew can make an older edit win a true conflict (accepted in ADR-0003/0045).
- `pending: true` and `rejected > 0` are the signals for a future "sync problem" indicator (#118/M3).

## Alternatives rejected

- **Server purge after N days:** a device offline for longer than N days would resurrect or `400`.
- **Unbounded retry:** two devices contending on one record could loop forever.
- **Merging only after a push conflict:** merging on pull avoids most conflicts entirely.
