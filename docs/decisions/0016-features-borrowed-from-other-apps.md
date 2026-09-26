# ADR-0016 — Features borrowed from other apps

**Status:** Accepted · 2026-09-26

## Context

A competitive scan (issue #14) surveyed Kubera, Pivot.Money, Ghostfolio, Firefly III, Empower
and MProfit. INDmoney now has family accounts (combined and per-member views), but still
cannot split a single asset by ownership share or track money lent and chit funds. That
remains the differentiator, now stated precisely in the README.

## Decision

All six ideas are accepted and placed where they are cheapest to build:

| Idea (source) | Issues | Milestone |
| --- | --- | --- |
| Nominee gap alerts (Pivot.Money) | #25 schema field, #31 alert | M3, M7 |
| Post-tax net worth (MProfit) | #26 tax lots, #28 view | M3, M5 |
| Direct-vs-regular commission drag (Empower) | #29 | M5 |
| Linked transfers, not full double-entry (Firefly III) | #27 | M3 |
| Benchmark vs Nifty 50 **TRI** (Ghostfolio) | #30 | M5 |
| Succession packet (Kubera) | #32, `area:security` | M8 |

- **Schema before views.** Nominees, tax lots and transfer links land in M3 because adding
  them after data exists would mean re-encrypting every record.
- **Linked transfers, not double-entry.** The app tracks balances and holdings, not a
  ledger; linking a transfer's two legs is enough to stop double-counting.
- **Tax rules are data**, keyed by financial year, because Indian capital-gains rules change
  (e.g. the 2024 Budget's LTCG and indexation changes).
- **Benchmark on TRI**, since the price index ignores dividends and flatters the portfolio.
- **No new privacy exposure.** The AMFI direct/regular pairing and the Nifty 50 TRI series
  are whole public downloads, never per-holding queries.

## Consequences

- M3 grows by three issues (two S, one M), M5 by three, M7 and M8 by one each.
- The succession packet needs a threat-model update and owner approval before merge.
