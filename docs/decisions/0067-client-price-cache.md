# ADR-0067 — Client price cache

**Status:** Accepted · 2026-11-01 · issue #168 · builds on [ADR-0064](0064-prices-and-valuation.md) Q5, [ADR-0065](0065-price-store-and-route.md), [ADR-0066](0066-price-ingest-schedule.md)

## Context

ADR-0064 Q5 says the client downloads every universe each day after unlock and keeps them
in Dexie for offline use. #168 builds that. Still open: where the files live, when a device
checks again, and how it avoids a request per minute.

## Decision

1. **Own database, `nwt-prices`.** One row per kind: `{kind, universe, etag, checkedOn}`.
   Only the newest good file is kept. There is no history: valuation needs today's file,
   and the M5 timeline draws from snapshots (#171). The files are public and identical for
   every household, so they sit outside `nwt-records`. Households on the device share them,
   and lock or sign-out never clears them (Q5's "cleared never").
2. **Never backwards.** `put` keeps the stored file when the download is older (by
   `date`), and only moves `checkedOn` forward.
3. **The price day turns over at 07:30 IST** (`priceDay`), after the server's morning
   retry (ADR-0066). A device checks each kind at most once per price day. That one check
   picks up both the 23:30 and the 07:00 runs.
4. **The request.** `GET /api/prices/universe/:kind/latest` for all seven kinds, in a fixed
   order, with `If-None-Match` set to the stored ETag and `cache: "no-store"` (the store is
   the cache). The refresher never sees a record, so no request can depend on holdings.
   The only header that varies is `If-None-Match`, which names a public file, not a holding.
5. **Outcomes.**
   - `200`: validate against the `universe` schema and the requested kind, then save.
     A file that fails either is dropped (`failed`).
   - `304`: mark the kind checked.
   - `404`: no file yet. Remembered in memory for the day, so it isn't asked again.
   - A network error or any other status: `failed`. The last good file stays and the next
     trigger retries.
   - In-flight refreshes are shared, so concurrent triggers make one set of requests.
6. **Triggers.** Prices ride the sync scheduler's triggers (unlock, `online`, the interval
   while visible) inside `startHouseholdSync`, fire-and-forget. They never block or fail a
   sync run. A local write doesn't trigger a refresh. Once every kind is checked, a trigger
   costs one memory lookup.

## Consequences

- Offline, valuation (#169) reads `toUniverses(await priceStore().all())`: the last good
  set with each file's own `date`, which drives the "as of" caption and the stale tone.
- Two devices that checked on different days send a different `If-None-Match` on their
  next check. #172 compares request URLs and methods across households, not that header.
- `onUpdate` is the hook #169 needs to re-value when a newer file lands.
- Two tabs open at once may each check once per price day. That's harmless: both get the
  same public bytes.
