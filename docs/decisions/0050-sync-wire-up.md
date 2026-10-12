# ADR-0050 — Sync wire-up: one household sync per unlocked session

**Status:** Accepted · 2026-10-13 · issue #118 (`area:security`, owner approval) · builds on [ADR-0049](0049-sync-engine.md), [ADR-0024](0024-lock-unlock-session.md), [ADR-0036](0036-e2e-record-probe.md)

## Context

M2 built the engine, store, cache and scheduler as separate parts (#115–#117). Something has to
start them once the household key is known and stop them on lock, and that thing has to hold
no keys. The E2E probe still stood in for push with a SQL insert (ADR-0036).

## Decision

- **`startHouseholdSync({ session, userId })`** (`src/sync/household-sync.ts`) assembles one
  household's sync: `localStore(householdId)`, `createRecordCache(session)`, the engine over
  `httpTransport`, and `startSyncScheduler`. It hydrates from IndexedDB first, so records show
  before the network answers, and then starts the scheduler.
- **The engine reads the HDK from the session on every step** and accepts only a key for the
  household it was started for. The handle holds no key, so React may keep it in state.
- **`write(id, type, data, deleted?)`** stamps `modifiedAt` (the client clock) and `modifiedBy`
  (the signed-in user id), queues the edit, and syncs in the background. A failed run
  (offline, `409 recovery-required`) is not fatal: the outbox keeps the edit, and the next
  trigger retries.
- **`records()` is a stable snapshot** for `useSyncExternalStore`, recomputed after hydrate,
  every write and every run. It is emptied on lock and on stop, so plaintext never outlives
  the cache.
- **`SyncProvider`** (`src/features/sync/`) mounts inside `HouseholdGate`, so it exists only
  while unlocked with the household key. Unmounting it (lock, sign-out) calls `stop()`.
  `useHouseholdSync()` and `useRecords()` are what M3's record screens consume.
- **The probe writes through the engine.** "Seal" writes or edits a record, "Delete" deletes
  it, and "Open records" syncs and lists. The spec's SQL insert is gone; ADR-0036 is amended.

## Consequences

- M2 acceptance runs end to end in `e2e/m2-acceptance.spec.ts`. An offline write is pushed by
  the `online` trigger, a stale-base conflict merges LWW on both devices, and a delete
  propagates. The DB holds only padded ciphertext, and the leak scan is clean.
- **A member without a recovery method can edit, but nothing is pushed** (ADR-0040). Edits wait
  in the outbox until a method exists. A joining member is not prompted today: the protection
  banner names the risk, but not the stuck edits. The "sync problem" indicator that ADR-0049
  anticipates should say so (M3).
- Files stay small. The provider is the only React code; the wiring is unit-tested with the
  fake server, an in-memory store and a fake browser environment.

## Alternatives rejected

- **Starting sync inside the key session:** that would mix key custody with network and storage
  concerns, and `setHouseholdKey` does not notify subscribers.
- **A module-level singleton engine:** a stale engine could outlive a lock or a household switch.
  Tying it to a mounted component makes its lifetime visible.
