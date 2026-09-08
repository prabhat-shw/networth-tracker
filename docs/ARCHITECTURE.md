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
│   /api/sync/pull · /api/sync/push · auth · key-wrap   │   AMFI NAVAll (daily)    │
│   Postgres via Drizzle — ciphertext columns only      │   Yahoo universes · FX   │
└───────────────────────────────────────────────────────┴──────────────────────────┘
```

## Layers

- **crypto** — key hierarchy (ADR-0002), record envelope seal/open. No app concepts.
- **domain** — pure functions over decrypted records: net worth by lens (mine / household /
  per-person), goal progress and projections, XIRR, loan amortisation, accrual calculators
  (EPF/PPF/NPS/SSY). Framework-free, exhaustively unit-tested. **This is the PR gate.**
- **db** — Dexie stores encrypted records plus a local index; the sync queue lives here.
- **sync** — pull/push with version vectors, tombstones, LWW merge (ADR-0003).
- **prices** — universe download, local lookup, staleness, manual overrides (ADR-0005).
- **features/ui** — client components only; they never touch crypto directly, only the
  repository layer that hands back decrypted domain objects.

## Data model (client-side, all encrypted at rest and in transit)

`household · member · institution · account · instrument · holding · transaction ·
liability · property · vehicle · insurancePolicy · receivable (money lent) · chitFund ·
goal · allocation · valuationOverride · document · snapshot`

Every asset/liability record carries `owners[] {memberId, sharePercent}` (sums to 100),
`allocations[] {goalId, mode, value}`, `includeInNetWorth`, `tags[]`, `asOf`.

Money is **integer paise** everywhere. Dates are ISO strings in IST.

## Why the server is dumb

It stores versioned opaque blobs and caches public prices. That is the whole job. It keeps
the zero-knowledge promise honest and makes the M9 Rust/Axum reimplementation a swap behind
the same contract, proven by the shared contract test suite.
