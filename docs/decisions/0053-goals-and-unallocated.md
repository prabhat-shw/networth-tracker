# ADR-0053 — Goal record and the Unallocated rules

**Status:** Accepted · 2026-10-27 · issue #134 · builds on [ADR-0051](0051-record-types-and-common-fields.md), [ADR-0052](0052-asset-and-liability-kinds.md)

## Context

ADR-0051 embedded allocations in the records that fund a goal and left two things to this
issue: what a `goal` record holds, and how claims are capped when they no longer fit (a
fixed ₹5L earmark on a fund that has fallen to ₹4L). "Unallocated" also needed a precise meaning
once liabilities can be earmarked too (a house goal nets its home loan, PLAN.md §1.1).

## Decision

- **`goal` record** (`src/domain/records/goal.ts`, v1): `kind` (the eight PLAN.md kinds),
  `name`, `targetAmount` (paise, in today's rupees), `targetDate`, `inflationBps`,
  `expectedReturnBps`, `priority` (1–5, 1 most important), `owners`, optional `colour` (one
  of the 8 categorical chart slots, UX.md §6.3) and `notes`. The form fills inflation from
  `DEFAULT_INFLATION_BPS` (6%, education 10%). The record always stores the rate used, so
  changing a default never moves an existing goal.
- **Claims** (`src/domain/earmarks.ts`): a percent claim is `floor(value × bps / 10 000)`,
  and a fixed claim is its amount. When a record's claims add up to more than its value,
  **every claim is scaled down in proportion** (`floor`, computed in `BigInt`), so no goal is
  silently favoured and nothing is more than 100% earmarked. The stored allocations are not
  rewritten: when the value recovers, the claims recover with it.
- **Per goal**: claims on assets minus claims on liabilities, which gives equity toward the
  goal, not gross value.
- **Unallocated** = unallocated assets − unallocated liabilities. So
  Σ earmarked + Unallocated = net worth, exactly. It can be negative: the household owes
  more than it holds unearmarked, and the UI says so rather than hiding it.
- **Records outside net worth** (`includeInNetWorth: false`) are skipped for both.
- **A claim on an unknown goal** (deleted, or not synced yet) counts as Unallocated. Deleting a
  goal therefore needs no rewrite of every record that funded it. The dangling `goalId` is
  dropped the next time that record is saved (#136).
- **Household view only.** Lens-weighted earmarks (Me, a member) come with the net-worth
  engine (#133); fixed amounts are then split by ownership share like the value.

## Consequences

- #132's `useGoals()` reads through `GOAL_CODEC`. The goal screen (#139) and M5's maths read
  `earmarks()`.
- Rounding only ever moves paise into Unallocated, never out of it.

## Alternatives rejected

- **Fixed claims first, percent from the remainder:** order-dependent, and it starves
  percent goals without saying so.
- **Refusing or rewriting records whose claims overshoot:** a market fall would break
  saves, or churn every device with edits nobody made.
- **Unallocated as assets only:** then earmarked + Unallocated ≠ net worth once a home loan
  is tagged to the house.
