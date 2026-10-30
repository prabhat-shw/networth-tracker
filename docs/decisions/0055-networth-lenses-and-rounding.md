# ADR-0055 — Net-worth lenses and share rounding

**Status:** Accepted · 2026-10-30 · issue #133 · builds on [ADR-0051](0051-record-types-and-common-fields.md), [ADR-0053](0053-goals-and-unallocated.md), [ADR-0054](0054-typed-records-and-member-profiles.md)

## Context

UX.md §2.1 promises one honest figure per lens: Household (full values) and each member
(share-weighted; Me is the viewer's own member lens). Shares are basis points (ADR-0051), so
a 1/3 share of an odd amount can't be exact. Rounding each owner's part on its own (the old
float `money.share`) lets members' lenses drift a paisa away from Household. ADR-0053 also
left lens-weighted earmarks to this issue.

## Decision

- **Largest remainder.** `splitByWeight` (`src/domain/money.ts`) floors every owner's part,
  then gives the leftover paise one each to the largest remainders, ties to the lowest member
  id. Parts always add up to the amount, every device computes the same split, and it runs in
  BigInt so crore-sized records never pass 2^53. The float `share(amount, percent)` is gone.
- **Lenses** (`src/domain/networth.ts`): `"household"` or `{ memberId }`. `netWorth(items, lens)`
  returns `{ assets, liabilities, net }`; `allLenses(items, memberIds)` returns every lens in
  one pass, with `household = Σ byMember + formerMembers` exactly.
- **Former members.** A share that points at someone no longer in the household stays in
  Household (the record is still the household's) and appears in no member's lens; it is
  reported as `formerMembers` so the UI can say so.
- **What counts.** `includeInNetWorth: false` records are skipped in every lens. `value` is
  the counted amount: term cover is ₹0 (schema, re-checked by `netWorthValue`), and RSU
  `value` is the vested holding only; `unvested` is a unit count that never adds.
- **Lens-weighted earmarks.** `earmarks(sources, goalIds, lens)` computes claims on the full
  value as before, then splits each claim by ownership share; the lens's Unallocated is its
  share of the value less its share of the claims. Members' earmarks add up to Household.

## Consequences

- `EarmarkSource` now carries `owners`. Home (#138) and Goals (#139) call `allLenses` /
  `earmarks` with the lens from the switcher; "Me" is `{ memberId: handle.userId }`.
- A member's lens can be 1 paisa away from a naive `value × bps / 10 000` — by design.
