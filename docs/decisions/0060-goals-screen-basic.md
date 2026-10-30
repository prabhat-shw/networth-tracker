# ADR-0060 — Goals screen (basic): CRUD, earmarked totals, Unallocated card

**Status:** Accepted · 2026-10-31 · issue #139 · builds on [ADR-0053](0053-goals-and-unallocated.md), [ADR-0057](0057-kind-fields-as-data-and-edit.md)

## Context

UX.md §3.6 lists goals as cards with status, progress, required SIP and an Unallocated row.
The goal maths (inflated target, SIP, on-track status) and the allocation editor are M5.
M3 needs only goal CRUD and the earmark totals that ADR-0053's `earmarks()` already
computes. The app is due 2026-11-01.

## Decision

- **Route `/goals`** (`src/features/goals/goals.tsx`), linked from Home's nav. Household view
  only. The Home lens doesn't reach this screen yet (ADR-0059's deferred lens store).
- **Cards, sorted by priority then target date.** Each card shows the name (tap to edit),
  kind and priority, and "₹earmarked of ₹target (year)". The earmarked figure is `earmarks().byGoal`
  over readable assets and liabilities, using `netWorthValue`. Liability claims subtract,
  so a house nets its home loan. No status badge or progress bar until M5 can compute them
  honestly.
- **Unallocated is a dashed, goal-shaped card** at the end. It shows whenever any record is in net
  worth, even with no goals (UX §3.6 empty state). A header reads "₹X earmarked of ₹Y net
  worth". Unreadable goals are counted in one line, not shown.
- **Form** (`goal-form.tsx`, the same native `<dialog>` as Add anything): kind, name, target in
  today's rupees, target date, priority 1–5 (default 3), Owned by (the shared `OwnedBy`),
  and Assumptions (collapsed) with inflation and expected return, plus notes. Inflation starts
  at the kind's PLAN.md §1.1 default and follows the kind until it's edited. Expected return
  defaults to 10% until M5 reviews it per kind (UX §12.1). Save is disabled until `goalData`
  parses. Edits merge over the stored record, so unknown-to-the-form fields (`colour`)
  survive.
- **Delete** asks for confirmation first, then writes a tombstone. Accounts keep their
  allocations; a claim on a missing goal counts as Unallocated (ADR-0053), so nothing is
  rewritten and the money reappears in Unallocated at once.
- Earmarking stays on the account form ("Tag to goal", ADR-0057).

## Consequences

- M5 adds status, progress and SIP to the same cards, and the allocation editor.
- `GOAL_KIND_LABEL` and `DEFAULT_RETURN_BPS` live in `src/features/goals/goal-kinds.ts`.
