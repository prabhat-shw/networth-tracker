# ADR-0058 — Accounts list: one responsive table, error rows on top

**Status:** Accepted · 2026-10-31 · issue #137 · builds on [ADR-0054](0054-typed-records-and-member-profiles.md), [ADR-0057](0057-kind-fields-as-data-and-edit.md)

## Context

UX.md §3.4 asks for a grouped mobile list and a dense desktop table, swipe actions, sortable
headers and j/k keys, with an error row for any record that can't be read. The app is due
2026-11-01, and an unreadable record has no `kind`, so it can't be placed in a section.

## Decision

- **One semantic table per section** (`src/features/accounts/accounts.tsx`), in a `<details open>`
  that collapses. Institution, Tagged and As of are `hidden sm:table-cell`, so the same markup
  is a compact list on a phone and a dense table on a laptop. No second rendering, and one
  set of tests.
- **All 9 `SECTIONS` render**, empty ones with "Nothing here yet". While searching, empty
  sections are hidden, and "No accounts match." shows when nothing does. Search matches name,
  institution and kind label, client-side.
- **Error rows go above the sections.** `invalid` reads "Couldn't load this record" with a
  two-step Remove (a tombstone, which any record may take: ADR-0051). `too-new` reads "Needs a
  newer app version" with no Remove, since a newer build can read it and deleting it here
  would lose data. Neither blocks the list.
- **Ownership badge** (`badge.ts`): nothing when the record is all the viewer's, "Bala's"
  when it is someone else's, and "◐ 60/40 · Bala" when it is shared, with the viewer's share
  first. A member with no profile reads "Former member". **Tagged** is the whole percent
  earmarked, rounded down and capped at 100.
- **Tap the name to edit.** The name is an `AddAnything` trigger with `editing` (ADR-0057).
  Edit and Delete live there. There is no separate "Update value" action yet.
- **Deferred:** sortable headers, j/k/Enter keys, swipe actions and skeleton rows (records
  are already in memory once unlocked).

## Consequences

- Route `/accounts`, linked from Home's nav. Home (#138) brings the lens; the badge then
  follows the lens instead of always taking the viewer's side.
