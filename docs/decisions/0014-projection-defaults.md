# ADR-0014 — Projection and insight defaults

**Status:** Accepted · 2026-09-26

## Context

The insights and projections UX pass (PR #17, `docs/UX.md` §11–12) needs default assumptions:
per-asset-class P10/P50/P90 returns, an inflation rate, a safe withdrawal rate for FI, and a
choice between a deterministic three-rate fan and a true Monte Carlo simulation. The spec
flagged all of them for the owner's review (§12.1).

## Decision

- **Inflation defaults to 8%** (the draft had 6%). It drives the real-vs-nominal overlay, the
  FI corpus and the Forecast tab. Per-goal inflation (e.g. 10% for education) remains a
  separate, per-goal input.
- **Everything else ships as drafted:** the §12.1 return bands, a 4% withdrawal rate
  (slider 3–5%), and the deterministic P10/P50/P90 fan (§12.3).
- **These are v1 defaults, tuned by use.** The owner will adjust them from hands-on testing.
  All of them stay visible and editable in the UI, so no number poses as researched truth.

## Consequences

- At 8%, about 70% of the reference year's nominal gain reads as inflation (53% at 6%), so the
  Insights copy is more sober. That is intended.
- A Monte Carlo engine remains the v2 upgrade path (§12.3, §13). It needs no server.
- Changing a default later is a UX change (update §12.1 and this ADR's successor), not a
  data migration: assumptions are household settings, not stored results.
