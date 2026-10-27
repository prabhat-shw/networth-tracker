# ADR-0051 — Record types, common fields and schema evolution

**Status:** Accepted · 2026-10-27 · issue #130 · builds on [ADR-0047](0047-record-plaintext-format.md), [ADR-0050](0050-sync-wire-up.md)

## Context

M2 syncs `{ type, schemaVersion, data }` without saying what goes in it. M3 adds the real
financial records (`docs/phases/M3.md`). Six questions had to be settled first. PLAN.md and
ARCHITECTURE.md also disagreed on where goal allocations live.

## Decision

1. **Five envelope types**: `member`, `asset`, `liability`, `goal`, `transaction`
   (`RECORD_TYPES`). Each is a Zod discriminated union on `data.kind` (FD, PPF, home loan, …,
   in #131). The type is sealed and padded, so the server never sees it, and five codecs are easier to version than thirty.
2. **Allocations are embedded** in the record they fund: `allocations[] { goalId, mode:
   percent, bps } | { goalId, mode: fixed, amount }`. LWW is per whole record, so the
   "≤ 100%" rule is checked on every write and a merge can never break it. Two members tagging the
   same FD at once keep the later edit, which is the same rule as every other field.
3. **Integers only**: shares, allocation and nominee percentages are **basis points**
   (10 000 = 100%), and amounts are paise. Owners sum to exactly 10 000. Percent allocations
   round **down** (`allocatedPaise`), so Unallocated is never understated.
4. **Schema evolution** (`src/domain/records/evolution.ts`): each type has a `current`
   `schemaVersion` and pure upgrade steps `v → v+1`, run in memory on read. `readRecord`
   returns `ok` (with `upgraded`), `unknown-type`, `too-new` or `invalid`. Only `ok`
   records may be saved over (`canOverwrite`). A newer or unknown record is kept untouched,
   shown as "needs a newer app version", and synced as is. Deleting is always allowed.
   Schemas are **strict**: an unknown field fails the parse instead of being dropped by a later save.
5. **Member names** live in a `member` record (display name, colour), inside the
   ciphertext, written by each member for themselves (#132). `memberId` is the lowercase
   user id, the same value as `modifiedBy`. An owner who has left reads "Former member".
6. **Market-priced kinds** (MF, stocks, crypto, gold) store `quantity` + an instrument key
   *and* a manual `value`/`asOf`. M4's valuation replaces the manual value when a price exists,
   so M4 needs no data migration.

Common fields (`src/domain/records/common.ts`): `owners`, `includeInNetWorth`, `institution?`,
`tags`, `notes?`, `asOf` (`YYYY-MM-DD`, IST), `allocations`, `nominees?` (#25: a member or a
named person, shares sum to 10 000). `zod` 4.6.7 (MIT) becomes a direct dependency.

## Consequences

- PLAN.md §1.1 and ARCHITECTURE.md now both describe embedded allocations in basis points.
- `money.share(amount, sharePercent)` still takes a float percent. #133 replaces it with a bps
  version when the net-worth engine lands.
- `invalid` issues name paths and rules, never values, but still stay on the device.
- Field-level merge stays out of scope: concurrent edits to one record keep the later one.

## Alternatives rejected

- **One envelope type per kind (~30):** thirty codecs to version, for no privacy gain.
- **Separate `allocation` records:** they survive concurrent tagging, but two merged
  allocations can add up to more than 100% with neither device at fault.
- **Float `sharePercent`:** 33.33 + 33.33 + 33.34 is not reliably 100 in floating point.
- **Permissive (stripping) schemas:** an older build would silently drop a newer field on save.
