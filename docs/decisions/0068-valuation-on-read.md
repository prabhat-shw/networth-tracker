# ADR-0068 — Valuation on read

**Status:** Accepted · 2026-11-01 · issue #169 · builds on [ADR-0064](0064-prices-and-valuation.md) §2 and §4, [ADR-0067](0067-client-price-cache.md)

## Context

ADR-0064 says a priced holding's value is derived on read and never written back, with the
stored `value` as the manual fallback. #169 builds that and the UX.md §2.3 captions. Still
open: which kinds count as priced, how each is valued, what "stale" is measured from, and
how the screens get the cached files.

## Decision

1. **`valuation(data, universes, now)`** in `src/domain/prices/valuation.ts` (pure) returns
   `{source: "market", value, asOf, stale}` or `{source: "manual", value, priceable}`.
   `valuedItems(assets, liabilities, universes, now)` feeds `netWorth()`/`allLenses()`
   unchanged. Any malformed input or overflow falls back to the manual value, never throws.
2. **Kinds.** `mutualFund`, `stock`, `usStock`, `crypto`: `quantity × price × fx`. `rsu`:
   `quantity` only (the vested units; `unvested` never counts). `foreignBank`: `balanceMinor`
   is hundredths of the currency (the form enters it like rupees), valued at the FX rate.
   `preciousMetal`: `weightMg × karat/24 × gold999` per gram, karat defaulting to 24; silver is
   priced at `silver999` whatever its karat. All rounded half-up to the paisa once.
   Every other kind keeps its entered value (`priceable: false`).
3. **Stale = the file's `fetchedAt` is over 36 h old** (UX.md §2.3), checked for the price's
   universe and, for a foreign price, the FX file too. `fetchedAt` advances on every
   successful ingest, even when the trading day is unchanged (weekends), so a weekend is not
   stale but a dead feed is. `asOf` is the trading day (`dates[code]` when given).
4. **Captions.** A market value shows `as of 8 Sep`, or `⚠ price stale · as of 5 Sep` in the
   warning tone. A priceable holding with no match shows `manual value · 30 Oct`. Others show
   only the entered date. Home and Goals show one summary caption, the **oldest** price date
   behind the figure and stale if any price is.
5. **Plumbing.** The sync handle loads `nwt-prices` after hydrate and again on the
   refresher's `onUpdate`, exposing a stable `universes()` snapshot on the same `subscribe`.
   The screens read it through `useUniverses()` / `useValuations()`. "now" is read when the
   records or universes change, so the stale tone can lag until the next re-render.

## Consequences

- No record changes when prices move: no daily rewrites, and LWW stays quiet.
- A user still types the code; an unmatched one stays on its manual value (#170 adds a picker).
- Allocations by amount are scaled against the market value, as earmarks already allow
  ([ADR-0053](0053-goals-and-unallocated.md)).
