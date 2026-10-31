# ADR-0063 — Tax lots on priced holdings, consumed FIFO

**Status:** Accepted · 2026-10-31 · issue #26 · builds on [ADR-0016](0016-features-borrowed-from-other-apps.md), [ADR-0051](0051-record-types-and-common-fields.md), [ADR-0057](0057-kind-fields-as-data-and-edit.md)

## Context

#26 (idea 2 of #14) asks for per-lot cost basis and acquisition date, so M5 can show net
worth after tax. Adding it after records exist means a migration, so the schema lands in M3.
Indian tax law takes MF and listed-equity units out FIFO, and equity bought by 31 Jan 2018
counts its gain from that day's market value (grandfathering).

## Decision

- **`lots` is an optional field on the priced kinds**: `mutualFund`, `stock`, `usStock`,
  `crypto`, `rsu`. These are the kinds with `quantity` + `instrument`. Each lot is
  `{ quantity, cost, acquired, fmv2018? }`. `quantity` is the same decimal string as the
  holding. `cost` is the whole lot's cost in paise, charges included. `fmv2018` is the whole
  lot's value on 31 Jan 2018, allowed only when `acquired` ≤ 2018-01-31. Stored as an
  optional field, not an empty list, so v1 records need no upgrade.
- **Totals, not per-unit prices.** A per-unit NAV has more than two decimals of a rupee and
  would need a decimal type. A lot total is plain paise. A part-sold lot prorates with
  bigint arithmetic and keeps the remainder, so sold + kept add up to the original exactly.
- **Lots must add up to `quantity`**, checked in the kind schema (a `refine` on `lots`).
  The holding's units stay the source M4 values, so lots can never disagree with them. Units
  are summed as integers of 10⁻⁸ (`src/domain/units.ts`), never floats.
- **FIFO is pure** (`consumeFifo` in `src/domain/lots.ts`): oldest `acquired` first, same-day
  lots in entered order, and a `RangeError` on overselling. It returns the sold parts and
  the remaining lots. The gains and tax maths over them are M5.
- **Manual entry**: a collapsed "Tax lots (optional)" section on priced kinds' forms. The
  first lot starts with every unit held. Each row has units, cost, date, and the 2018 value
  only for old enough dates. A live line says how many units the lots hold, and the schema
  keeps Save off until they match. Removing every lot drops the field. M6's statement import
  writes the same field.
- `record-form.tsx`'s buttons moved to `form-actions.tsx` to stay under the 300-line cap.

## Consequences

- Lots are inside the ciphertext like every field. Nothing new reaches the server.
- Recording a sell doesn't yet rewrite lots. That needs the sell flow (M5/M6) to call
  `consumeFifo`.
- Debt funds bought after Apr 2023 are taxed at slab rate whatever the holding period. That
  rule is M5's tax maths, not the lot shape.
