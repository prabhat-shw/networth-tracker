# ADR-0005 — Public price feeds without leaking holdings

**Status:** Accepted · 2026-09-08 · sources amended by [ADR-0064](0064-prices-and-valuation.md) (2026-10-31)

## Context

Valuation needs daily prices, but asking a server "what is the NAV of scheme 120503?"
reveals a holding — which would undo ADR-0001 through metadata.

## Decision

The server caches **whole public universes** on a daily schedule; the client downloads the
full set and looks up locally. Verified sources (all reachable, checked 2026-09-08):

| Data | Source | Notes |
| --- | --- | --- |
| All MF NAVs | `https://portal.amfiindia.com/spages/NAVAll.txt` | ~1.5 MB/day, scheme code + ISIN |
| Indian equity / ETF | NSE and BSE daily bhavcopy (ADR-0064) | one official file per exchange |
| US stocks / crypto | Yahoo `spark` over a fixed top-N list; CoinGecko top 500 (ADR-0064) | lists fixed in the repo, not per holding |
| FX (USD→INR etc.) | `https://api.frankfurter.dev/v1/latest` | free, no key |
| Gold / silver | IBJA daily rates per gram (ADR-0064) | manual override always available |
| EPF/PPF/NPS/SSY rates | Config table in repo | updated by ADR when rates change |

Long-tail symbols not in a universe fall back to a per-symbol fetch **only with an explicit
in-app warning**, or to a manual price override.

## Consequences

- Slightly heavier first sync (a few hundred KB gzipped), then deltas by date.
- Feeds are unofficial and will break; each has a manual-override path so the app never
  hard-depends on a scraper. Price staleness is shown in the UI.
