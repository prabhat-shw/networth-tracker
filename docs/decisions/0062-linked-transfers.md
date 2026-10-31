# ADR-0062 — Linked transfers, not double-entry

**Status:** Accepted · 2026-10-31 · issue #27 · builds on [ADR-0016](0016-features-borrowed-from-other-apps.md), [ADR-0051](0051-record-types-and-common-fields.md), [ADR-0055](0055-networth-lenses-and-rounding.md)

## Context

#27 (idea 4 of #14) borrows the useful part of Firefly III's double-entry: a transfer
between two of the household's own accounts must not count as new money in contributions or in
the contribution-vs-growth bridge (UX.md §11.1). ADR-0051 reserved the `transaction`
envelope type but gave it no schema.

## Decision

- **A `transaction` is one leg**: `kind` `in` or `out` on one `accountId` (an asset or
  liability record), `amount` in paise (≥ 1), `date`, optional `description` and `notes`
  (`src/domain/records/transaction.ts`). Ownership follows the account. A leg has no owners
  of its own, so a re-split of the account re-splits its history.
- **A transfer is two legs sharing a `transferId`**: one `out`, one `in`, different accounts,
  equal amounts. Each account's history then reads only its own legs, and M6's statement import
  can write each statement line as a leg and link a matching pair later.
- **Contributions** (`src/domain/contributions.ts`): unlinked legs count as added (`in`) or
  withdrawn (`out`). In Household a linked transfer counts nowhere. In a member's lens it
  counts as the change in that member's share: Asha's savings into a joint 50/50 FD gives Bala
  +50% and Asha −50%. The members' lenses therefore still add up to Household (zero) to the
  paisa, using the same `splitByWeight` rounding as net worth.
- **A broken transfer counts nowhere.** A missing leg (unsynced, deleted) or a mismatched
  pair is excluded from every lens and reported by `transferIssues()` for the UI to show.
  Pairing spans two records, so it can't be checked in `prepareWrite` or kept true across
  whole-record LWW merges. It is checked when read.
- **Net worth is unaffected**: it is computed from asset and liability values (ADR-0055).
  Transactions never feed it, so a transfer changes it only through the two balances, which
  cancel.

## Why not full double-entry

Double-entry needs every rupee to come from an account, including income, expense and
equity accounts the household never sees. Indian households log a few flows (SIPs, FD
renewals, PPF deposits), not a ledger. Balances here are entered or priced (M4), not derived from
postings, so a strict ledger would contradict the stored values on day one. Linked legs give
the one guarantee that matters for the bridge (no double-counted transfers) at a fraction of
the model and the UI.

## Consequences

- No form or list for transactions yet. Contributions feed the M5 bridge; entry can come with
  M5 or M6 import.
- A transfer between accounts with different owners shows up as money added or withdrawn
  in member lenses. That is intended: it changes what each member owns.
