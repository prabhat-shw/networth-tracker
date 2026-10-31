# ADR-0061 — Nominees field in Add anything

**Status:** Accepted · 2026-10-31 · issue #25 · builds on [ADR-0016](0016-features-borrowed-from-other-apps.md), [ADR-0057](0057-kind-fields-as-data-and-edit.md)

## Context

#25 (from ADR-0016) asks for an optional nominee list on every asset: a member or a
free-text name, with a share. The schema already carries it (`nominees` in
`src/domain/records/common.ts`, #130): a discriminated union of `member` / `person`, shares
in basis points summing to 10 000, 1–10 entries, no repeats, and the field omitted rather
than empty. Unit tests cover those rules. Edit already preserved stored nominees untouched.
What was missing is the form control.

## Decision

- **`Nominees` (`src/features/add/nominees.tsx`), collapsed under "Nominees (optional)"**
  after Tag to goal, like Notes. It opens when the record already has nominees. Nominees are
  rarely entered at first add, so they stay out of the way of the six-field skeleton.
- **Assets only.** A liability has no nominee. Its form shows no control and keeps whatever
  it stored.
- **One "+ Add a nominee" select**: each household member not yet listed ("Me" for the
  viewer), then "Someone else…", which adds a row with a name input. Members are stored by
  id, so a rename follows them; a departed member reads "Former member".
- **Shares re-split evenly on every add and remove** (the odd basis points go to the first
  row), then stay editable. The live chip is the same `ShareChip` as Owned by, so both splits
  read and behave alike.
- **Removing the last row drops the field.** The schema rejects an empty list.
- **The schema decides Save**, as elsewhere (ADR-0057): an unnamed person or shares that
  don't add up keep Save disabled, and the chip says why.

## Consequences

- Nominees are encrypted like every other field. Nothing new reaches the server.
- The gap alert ("assets without a nominee") stays a separate M7 issue.
- Accounts doesn't show nominees yet. A badge can come with the M7 alert.
