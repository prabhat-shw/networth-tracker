# Architecture

```
┌───────────────── Your device — the only place plaintext exists ─────────────────┐
│  Next.js client (PWA, offline-capable)                                          │
│   src/crypto/    WebCrypto + Argon2id: key hierarchy, wrap/unwrap, envelopes     │
│   src/domain/    valuation, ownership shares, goals, XIRR, amortisation (pure)   │
│   src/parsers/   CAS / CSV / PDF readers — run in Web Workers, no network        │
│   src/db/        Dexie: ciphertext at rest, decrypted cache in memory            │
│   src/features/  UI feature folders (accounts, goals, dashboard, …)              │
└──────────┬──────────────────────────────── downloads whole price universes ─────┘
           │ sync: opaque blobs                                   ▲
┌──────────▼───────────────────────────────────────────┬──────────┴───────────────┐
│  Sync API (thin, replaceable — see docs/api/CONTRACT) │  Price service           │
│   …/records pull·push · auth · key-wrap · vaults      │   AMFI NAVAll (daily)    │
│   Postgres via Drizzle — ciphertext columns only      │   Bhavcopy·US·crypto·FX  │
└───────────────────────────────────────────────────────┴──────────────────────────┘
```

## Layers

- **crypto** — key hierarchy (ADR-0002), record envelope seal/open. No app concepts.
- **domain** — pure functions over decrypted records: net worth by lens (mine / household /
  per-person), goal progress and projections, XIRR, loan amortisation, accrual calculators
  (EPF/PPF/NPS/SSY). Framework-free, exhaustively unit-tested. **This is the PR gate.**
- **db** — Dexie (`nwt-records`) stores sealed envelopes, the outbox and the pull cursor:
  ciphertext only. Decrypted records live in an in-memory cache dropped on lock (ADR-0048).
- **sync** (`src/sync/`) — pure engine over an injected transport and store: pull by server
  `seq` cursor, push the outbox with per-record optimistic concurrency, merge on arrival with
  LWW on `modifiedAt`/`modifiedBy` inside the plaintext, bounded retries, tombstones kept;
  runs after unlock, on `online` and on an interval while visible (ADR-0003, 0045, 0049).
  `startHouseholdSync` wires one household's store, cache, engine and scheduler; the
  `SyncProvider` inside the household gate owns its lifetime, and screens read
  `useRecords()` (ADR-0050). The handle's `status()` (`useSyncStatus()`) drives the sync
  indicator, including `recovery` for pushes refused with ADR-0040's 409 (ADR-0059).
- **prices** — universe download, local lookup, staleness, manual overrides (ADR-0005). Pure maths in
  `src/domain/prices/`: decimal-string prices, `marketValue` in bigint rounded once to paise, values derived on
  read and never written back ([ADR-0064](decisions/0064-prices-and-valuation.md)). One pure parser per
  feed there; the server's only network code for feeds is `src/server/price-feeds.ts`, with fixed URLs.
  `src/server/prices.ts` ingests into `price_universes` and serves them ([ADR-0065](decisions/0065-price-store-and-route.md)); `price-schedule.ts` runs every
  kind at 23:30 + 07:00 IST, from `src/instrumentation.ts` at home and a Vercel cron on staging ([ADR-0066](decisions/0066-price-ingest-schedule.md)).
- **features/ui** — client components only; they never touch crypto directly, only the
  repository layer that hands back decrypted domain objects.

## Data model (client-side, all encrypted at rest and in transit)

`household · member · institution · account · instrument · holding · transaction ·
liability · property · vehicle · insurancePolicy · receivable (money lent) · chitFund ·
goal · allocation · valuationOverride · document · snapshot`

Those are the *concepts*. Assets and liabilities are 29 + 3 kinds, placed in `src/domain/records/catalogue.ts`
([ADR-0052](decisions/0052-asset-and-liability-kinds.md)). Records travel in five envelope types (`member`, `asset`, `liability`,
`goal`, `transaction`), each a discriminated union on `data.kind`, versioned per type with
in-memory upgrades; a record from a newer app is kept and never overwritten
([ADR-0051](decisions/0051-record-types-and-common-fields.md), `src/domain/records/`).
A `transaction` is one leg (`in`/`out` on one account); a transfer between own accounts is two legs
sharing a `transferId`, which `src/domain/contributions.ts` never counts as new money
([ADR-0062](decisions/0062-linked-transfers.md)).
Priced holdings may carry `lots[] {quantity, cost, acquired, fmv2018?}` that add up to `quantity`; units are
summed as integers of 10⁻⁸ (`src/domain/units.ts`) and sells consume lots FIFO (`src/domain/lots.ts`,
[ADR-0063](decisions/0063-tax-lots.md)).
Every asset/liability record carries `owners[] {memberId, shareBps}` (basis points, sum
10 000), embedded `allocations[] {goalId, mode, bps | amount}`, `includeInNetWorth`,
`tags[]`, `asOf`, optional `nominees[]`. Screens read typed lists (`useAssets()` etc.) and
save through `useRecordWriter()`, which validates before sealing; member names live in
self-written encrypted `member` records ([ADR-0054](decisions/0054-typed-records-and-member-profiles.md)).

Server-side data tables: `records` (ADR-0003), `households` (id), `household_members`
(public key + HDK wrapped to it, ADR-0019), `identity_vaults` (ADR-0022) and
`household_invites` (email hash per household, ADR-0023). All opaque. Better Auth's tables
(ADR-0020) hold account data only.

Money is **integer paise** everywhere. Dates are ISO strings in IST.

## Why the server is dumb

It stores versioned opaque blobs and caches public prices. That is the whole job. It keeps
the zero-knowledge promise honest and makes the M9 Rust/Axum reimplementation a swap behind
the same contract, proven by the shared contract test suite.
