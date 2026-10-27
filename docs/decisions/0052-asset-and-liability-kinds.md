# ADR-0052 — Asset and liability kinds

**Status:** Accepted · 2026-10-27 · issue #131 · builds on [ADR-0051](0051-record-types-and-common-fields.md)

## Context

ADR-0051 put every asset in one `asset` type and every liability in one `liability` type,
each a union on `data.kind`. PLAN.md's taxonomy names about 45 things; UX.md §4.2 names the
few fields each needs. This ADR fixes the kind list and how numbers are stored.

## Decision

- **29 asset kinds and 3 liability kinds** (`src/domain/records/asset.ts`, `liability.ts`).
  Near-identical things share a kind and differ by an enum. That covers:
  - `bankAccount` (savings, current, sweep-in), `fixedDeposit` (bank, corporate, post-office TD/MIS)
  - `smallSavings` (NSC, KVP, SCSS), `preciousMetal` (gold, silver, any form)
  - `insurance` (endowment, money-back, ULIP, term), `loan` (home, vehicle, personal, education, secured)

  A joint account is not a kind: it is any account with two owners. VPF is a flag on `epf`.
- **Every kind has `name` and `value`**: what it is worth (an asset) or what is still owed
  (a liability), in paise and never negative. The engine (#133) applies the sign by type.
- **Quantities are decimal strings** (`"1234.567"`, up to 8 places): MF units, shares,
  crypto. Unit counts aren't money, but float drift would still corrupt `units × price`.
  M4 multiplies them with integer arithmetic.
- **Other numbers are integers**: rates in bps (7.1% = 710), weights in milligrams, foreign
  balances in that currency's minor units next to an INR `value`.
- **Priced kinds** (`mutualFund`, `stock`, `crypto`, `usStock`, `rsu`) carry `quantity` +
  `instrument { source, code }`. `source` is one of the public universes (`amfi`, `nse`, `bse`,
  `us`, `crypto`), so a holding can never point at a per-symbol price API. The manual `value`
  is the fallback until M4 values it.
- **Kind rules in the schema**: term insurance counts ₹0, deposits can't mature before they
  start, a chit can't be paid past its length. RSU `unvested` units sit apart from `value`.
- **Placement** (`catalogue.ts`): each kind maps to one of the 7 add-flow buckets and one of
  the 9 Accounts sections. The maps are typed against the kind unions, so a new kind that isn't
  placed fails to compile.

## Consequences

- The add flow (#135/#136) shows finer UI types (savings vs joint, TD vs MIS) that map onto
  these kinds with preset fields. The schema stays small.
- `asset` and `liability` are both at `schemaVersion` 1 (`BALANCE_SHEET_CODECS`). The next field change
  bumps the version and adds an upgrade step (ADR-0051).
- Vesting maths, accrual calculators and amortisation stay in M7. Attachments stay in M6.

## Alternatives rejected

- **One kind per PLAN.md bullet (~45):** many identical schemas and a bigger picker map, for
  no gain the enums don't already give.
- **Float quantities:** the same drift as float money, one multiplication later.
- **A free-form instrument URL or ticker lookup:** it invites per-holding price queries,
  which would leak what the household owns.
