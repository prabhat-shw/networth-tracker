# ADR-0057 — Kind fields as data; edit merges over the stored record

**Status:** Accepted · 2026-10-31 · issue #136 · supersedes the "staged kinds" part of [ADR-0056](0056-add-anything-skeleton.md)

## Context

32 kinds each add 0–3 fields below Value (UX.md §4.2). Hand-writing 32 forms would be about
32 × 50 lines of near-duplicate JSX. Edit also has a trap: the form shows only some of a
record's fields (not nominees, tags, linked records or fixed earmarks), so rebuilding the
record from the form alone would silently erase them on every save.

## Decision

- **Field specs as data** (`src/features/add/field-specs.ts`): `KIND_FIELDS` maps every kind
  to a list of `{ key, label, input }`. The input is select, switch, text, date, rupees,
  percent, units, int, grams or instrument. It is typed against the kind unions, so a new kind
  without its fields fails to compile. `KindFields` draws any list. `readFields` /
  `fieldInputs` (`fields.ts`) convert between form strings and typed values, by string
  arithmetic only (paise, bps, mg). A unit test fills each kind's required fields and checks
  that the result parses against that kind's schema.
- **The schema is the validator.** The form builds the full record and runs the kind's Zod
  schema on every change. Save is enabled only when it parses. A custom rule's message (such as
  "term cover is tracked at ₹0") is shown inline. ADR-0056's "coming soon" kinds are gone.
- **Edit = stored record ⊕ form.** The form starts from the stored data and overlays only
  the fields it shows; a blank optional field deletes its key. Everything else round-trips.
  `AddAnything editing={{ id, data }}` opens straight at the form, with Delete
  (two-step: "Delete" → "Yes, delete for everyone", a tombstone via `useRecordWriter.remove`).
- **Tag to goal** (`goal-tags.tsx`): percent earmarks only. Stored fixed earmarks are kept.
  Earmarks on deleted goals are dropped on save, as ADR-0053 promised. The fixed-amount editor
  is M5.
- **Save & add another** (add only): saves, then returns to step 2 of the same bucket with
  "Saved <name>".
- **Selects carry `aria-label`.** A select inside its `<label>` otherwise takes the selected
  option into its accessible name ("Policy type Endowment").

## Consequences

- Linking a property to its loan (`linkedLiabilityIds`, `linkedAssetId`) has no input yet.
  `KIND_BASE` gives a new property `[]`, and edit keeps any stored links.
- The Accounts list (#137) opens edit by rendering `AddAnything` with `editing`.
