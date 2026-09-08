# ADR-0004 — Ownership shares and goal earmarking

**Status:** Accepted · 2026-09-08

## Context

The reason this app exists: mainstream trackers assume one PAN owns 100% of everything.
Real households hold joint accounts, a flat bought 50/50, a spouse's EPF. Separately, the
owner wants to know not just *how much* they have but *what it is for* — house, children's
education, retirement.

## Decision

Two orthogonal dimensions on every asset/liability record:

1. `owners[] { memberId, sharePercent }` — must sum to 100. Views: **My net worth** (share
   weighted), **Household** (full), **Per-person**.
2. `allocations[] { goalId, mode: percent|fixed, value }` — earmarks value to goals; the
   remainder is implicitly **Unallocated**. Auto-tag rules (e.g. NPS → retirement) apply at
   creation. Liabilities can be tagged, so a house goal nets its home loan and shows equity.

Goal maths (inflated target, shortfall, required monthly SIP, on-track projection,
suitability warning) lives in `src/domain/goals` as pure, unit-tested functions.

## Consequences

- Every aggregate must state its lens (mine vs household) — the UI never shows a bare number.
- Allocation invariants (≤100% per source) are enforced client-side and unit-tested; the
  server cannot validate them because it cannot read the data.
