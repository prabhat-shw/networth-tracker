# ADR-0069 — Instrument picker

**Status:** Accepted · 2026-11-01 · issue #170 · builds on [ADR-0064](0064-prices-and-valuation.md), [ADR-0068](0068-valuation-on-read.md)

## Context

Until now the user typed a scheme code or ticker by hand and nothing checked it. #170 lets
them search for it instead. The rule from ADR-0005 still holds: no request may name a holding.

## Decision

1. **Search only what is on the device.** `searchUniverse(universes, sources, query)`
   (`src/domain/prices/search.ts`, pure) reads the cached universes. Typing makes no request.
   The browser test checks that `fetch` is never called.
2. **Ranking:** exact code, then codes starting with the query, then names containing every
   word (any case, any order). Ties keep the universe's order. At most 8 matches.
3. **Multi-source kinds search every source.** A stock matches on both NSE and BSE.
   Picking a match sets its exchange.
4. **Filling the value.** Picking a match fills "Current value" with `units × price × fx`
   when the units are valid. A typed code that matches shows `Today ₹29.7532 per unit · as of
   31 Oct` and a "Use ₹X as the value" button. The stored `value` stays the manual fallback
   (ADR-0068). The figure on screen still comes from valuation on read.
5. **Unmatched codes are allowed.** The field shows "No price found … (manual value)", or
   "Prices aren't downloaded yet". The record saves either way. A code isn't wrong just
   because today's top-N list doesn't include it.

## Consequences

- Name search works for every kind: the AMFI, bhavcopy, US and crypto parsers all fill
  `names`. A code missing from `names` still matches by code.
- A plain list of buttons (not a full ARIA listbox) keeps keyboard use simple. Tab and Enter
  work. Arrow-key navigation can follow in the M5 polish.
