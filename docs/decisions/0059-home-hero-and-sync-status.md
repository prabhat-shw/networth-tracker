# ADR-0059 — Home hero per lens, and a sync status on the handle

**Status:** Accepted · 2026-10-31 · issue #138 · builds on [ADR-0040](0040-recovery-method-before-first-data.md), [ADR-0050](0050-sync-wire-up.md), [ADR-0055](0055-networth-lenses-and-rounding.md)

## Context

UX.md §3.2 puts one honest figure on Home with the Me · Household · member lens (§2.1), and
§2.3 asks for a sync indicator that's always honest. A member with no recovery method can
write, but every push gets `409 recovery-required` (ADR-0040). Until now the error went to a
no-op `onError`, so the edits sat in the outbox with no signal. #34 also left "Home fits one
screen" open. The app is due 2026-11-01.

## Decision

- **Status lives on the sync handle.** `HouseholdSync.status()` returns
  `{ state, lastSyncedAt, pending }`, the same object until it changes (like `records()`),
  and `useSyncStatus()` reads it with `useSyncExternalStore`. Every run, the scheduler's
  included, goes through one wrapper. The run sets `syncing`, then `synced` (with
  `lastSyncedAt` and `pending` from the result), or a failed state. A `SyncHttpError` 409 is
  `recovery`. Any other failure is `offline`: the next trigger retries either way. A status-only
  change notifies listeners without rebuilding the records snapshot.
- **Indicator** (`src/features/home/sync-status.tsx`): "Synced 4 min ago" is muted and hidden
  below `sm`, and "Syncing…" is muted. Offline is an info line ("changes save on this device and
  sync later"), not an alert. `recovery` is a warning `role="alert"`: "Changes are waiting: add
  a recovery method so they can sync", with a link to Settings. Icons are `aria-hidden`; the
  words carry the meaning. It renders nothing outside a running sync.
- **Hero** (`src/features/home/net-worth.tsx`). `summarize()` turns typed entries into
  `allLenses` (ADR-0055). The lens toggle is a `<fieldset>` of `aria-pressed` buttons: Me,
  Household, then each other member with a profile, by name. Household is the default. It
  shows net, then assets and liabilities.
- **Lens members = the viewer + everyone with a profile.** Home doesn't fetch the server's member
  list. A member who hasn't set a name yet gets no lens, and their shares count in Household
  only, the same as a former member's (ADR-0054 asks every member for a name on Home).
- **Partial failure stays partial.** Unreadable records are left out of every figure, and a line
  says how many, with a link to Accounts. The zero-state shows only when no asset or liability
  exists at all.
- **#34 settled: Home fits one screen** because it holds only the indicator, the hero, an Add
  button, Invite a member and the nav. The sparkline, composition bar, nudges and goals carousel
  wait for M4/M5, and each must keep it to one screen when it lands.

## Consequences

- No count-up animation on lens switch yet; the swap is instant.
- **Deferred:** the Accounts badge and values following the Home lens. Each route remounts the
  sync, so the lens needs a shared store first. Until then the badge always takes the
  viewer's side (ADR-0058).
- `HouseholdSync` gained a required `status()`, so test fakes implement it.
