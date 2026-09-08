# ADR-0005 — Public price feeds without leaking holdings

**Status:** Accepted · 2026-09-08

## Context

Valuation needs daily prices, but asking a server "what is the NAV of scheme 120503?"
reveals a holding — which would undo ADR-0001 through metadata.

## Decision

The server caches **whole public universes** on a daily schedule; the client downloads the
full set and looks up locally. Verified sources (all reachable, checked 2026-09-08):

| Data | Source | Notes |
| --- | --- | --- |
| All MF NAVs | `https://portal.amfiindia.com/spages/NAVAll.txt` | ~1.5 MB/day, scheme code + ISIN |
| Indian equity / ETF / US stocks / crypto | Yahoo Finance chart API | universe file, not per-symbol |
| FX (USD→INR etc.) | `https://api.frankfurter.dev/v1/latest` | free, no key |
| Gold / silver | Gold ETF + published rates | manual override always available |
| EPF/PPF/NPS/SSY rates | Config table in repo | updated by ADR when rates change |

Long-tail symbols not in a universe fall back to a per-symbol fetch **only with an explicit
in-app warning**, or to a manual price override.

## Consequences

- Slightly heavier first sync (a few hundred KB gzipped), then deltas by date.
- Feeds are unofficial and will break; each has a manual-override path so the app never
  hard-depends on a scraper. Price staleness is shown in the UI.
