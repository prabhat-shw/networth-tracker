# ADR-0064 — Prices, universes and valuation

**Status:** Accepted · 2026-10-31 · issue #162 · amends [ADR-0005](0005-public-price-feeds.md) · brief `docs/phases/M4.md`

## Context

M4 values priced holdings from public universes without naming any holding in a request.
Sources were re-verified on 2026-10-31. AMFI `NAVAll.txt` (1.5 MB, now with Plan/Option
columns), NSE and BSE bhavcopy CSVs, Frankfurter, CoinGecko `coins/markets` and the IBJA rates
page all answer. Yahoo's `v7/finance/quote` now returns 401. Its `v7/finance/spark` batch
still works.

## Decision

1. **Price grammar.** A price is a decimal string per unit in its own currency, with up to 15
   whole digits and 12 decimals (`src/domain/prices/price.ts`). An FX rate is rupees per unit.
   `marketValue(quantity, price, fx)` multiplies units (10⁻⁸), price and rate (10⁻¹²) as
   bigints and rounds half-up to paise once. It is named `marketValue`, not `valueOf`, so it
   doesn't shadow `Object.prototype.valueOf`.
2. **Derived, never written back.** A valued figure is computed on read and never saved. The
   stored `value` stays the manual fallback, shown as "manual value" when no price matched.
3. **Sources.** `amfi`: `NAVAll.txt` by scheme code. `nse`/`bse`: the daily bhavcopy, equity
   and ETFs, which covers gold ETFs. `us`: a fixed top-N ticker list in the repo, fetched by
   the server through Yahoo `spark` batches. `crypto`: CoinGecko `coins/markets`, top 500 by
   market cap, in USD. `fx`: Frankfurter (ECB rates) for the currencies the catalogue allows.
   No source depends on what any household holds.
4. **Metals.** A `metal` universe holds rupees per gram for `gold999` and `silver999` from
   IBJA's daily rates. Other karats are prorated (`karat/24`). It is an HTML page, so the
   parser is the most fragile one: on failure the universe goes stale, and the manual value
   is always there.
5. **Universe file.** One per kind per day: `{ kind, date, fetchedAt, source, currency,
   prices: { code: price } }`, validated by `universe` in `src/domain/prices/universe.ts`.
   Optional maps carry `names` (picker), `isins` (ISIN → code, M6 import) and `dates`
   (a code's own price date when it differs, e.g. a wound-up fund), added by #163.
   Codes are matched without case, and prototype keys never match. The server keeps 400 days
   in a plaintext table (public data, never joined to households). The route needs a session
   but never varies by user. The client downloads every kind daily into Dexie.
6. **Schedule.** One pure `ingest(kind, date)`. The home server runs it in-process at 23:30
   IST (after AMFI and bhavcopy publish) and retries at 07:00 IST (after the US close).
   Staging uses a Vercel cron to a `CRON_SECRET` route.
7. **Poisoned or broken feeds.** Ingest rejects a file with under 50% of the previous file's
   codes, flags day-on-day moves over 50%, and keeps serving the last good file. The client
   shows the date it actually has.
8. **Snapshots.** A daily `snapshot` envelope type (per-lens totals and per-bucket
   composition), written by the first device to open the app that day. Its id is an HMAC of
   the date under a key derived from the HDK, formatted as a UUID, so devices converge on one
   record and the server learns nothing new. That makes #171 `area:crypto`. No backfill.

## Consequences

- A long-tail instrument outside every universe keeps its manual value. ADR-0005's warned
  per-symbol fetch stays unbuilt.
- The top-N lists for US and crypto need an occasional refresh by PR. A holding that drops
  out of them falls back to its manual value.
- Feed formats will drift. Each parser ships with a real-day fixture, so a break shows up as a
  failed ingest, never as wrong prices.
