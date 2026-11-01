# ADR-0065 — Price store, ingest checks and the universe route

**Status:** Accepted · 2026-11-01 · issue #166 · builds on [ADR-0064](0064-prices-and-valuation.md)

## Context

ADR-0064 Q5–Q7 fixed the shape: one universe per kind per day, 400 days in Postgres, a route
that needs a session but never varies by user, and ingest checks against poisoned feeds.
#166 builds it. The details below weren't settled there.

## Decision

1. **Stored as served.** `price_universes (kind, date) → gzip, etag, count, flagged,
   fetched_at`. The gzip is computed once at ingest, and the route returns those bytes, so
   every household gets byte-identical responses (#172 relies on it). ETag is the first 27
   base64url characters of the SHA-256 of the gzip.
2. **`latest` alias.** The client asks `/:kind/latest`, never "today": weekends, holidays
   and late feeds would 404 otherwise, and the request stays the same for everyone. A dated
   path serves history.
3. **Caching.** A day before today (IST) can't change: `private, max-age=1y, immutable`.
   `latest` and today: `private, no-cache` with ETag revalidation (`304`). `private` because
   the route sits behind a session.
4. **Ingest checks.** `ingest(deps, kind, date)` compares with the newest stored file on or
   before the new file's date. Under half its codes → rejected and nothing written. Codes
   moving more than 50% either way (`|new − old| × 2 > old`, exact bigint) are stored but
   counted in `flagged` and returned for the log. A failed fetch or a file that fails the
   `universe` schema → `failed`, nothing written. A same-day retry replaces the row.
5. **Retention.** Each successful ingest deletes that kind's files older than 400 days.
6. **NSE zip without a dependency.** `src/server/unzip.ts` reads one entry through the
   central directory with `node:zlib`, output capped at 64 MB.
7. **Fetch URLs.** AMFI `portal.amfiindia.com/spages/NAVAll.txt` (always the latest);
   NSE/BSE bhavcopies by date (`price-feeds.ts`). BSE needs a `Referer`, and all feeds get a
   browser User-Agent.

## Consequences

- Staging needs `pnpm db:migrate` (migration 0009) before this merges.
- Nothing calls `ingest` yet: #167 schedules it and logs its results.
- The E2E plaintext scan reads every table; prices are public, but #172 should keep any
  household data out of this table.
