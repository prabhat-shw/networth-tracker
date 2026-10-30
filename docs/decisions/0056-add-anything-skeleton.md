# ADR-0056 — Add anything: native dialog and staged kinds

**Status:** Accepted · 2026-10-30 · issue #135 · builds on [ADR-0052](0052-asset-and-liability-kinds.md), [ADR-0054](0054-typed-records-and-member-profiles.md)

## Context

UX.md §3.5 asks for a shadcn `Sheet` on mobile and a `Dialog` on desktop. shadcn/ui is not
installed yet, and the app is due in two days (STATE.md). The common form (#135) also comes
before the per-kind fields (#136), but most kinds' schemas require kind-specific fields.

## Decision

- **Native `<dialog>` with `showModal()`** (`src/features/add/add-anything.tsx`): a bottom
  sheet below `sm`, centred from `sm` up. The browser provides focus trapping, Escape, the
  scrim and the `dialog` role, with no new dependency. If shadcn arrives later, it can wrap
  the same step components.
- **Staged kinds** (`src/features/add/kinds.ts`): each kind has a label and `defaults` for its
  required kind fields (an FD saves as bank/cumulative, a loan as "other"). A kind whose
  required fields can't be defaulted (units + instrument, a counterparty, an instalment) has
  `defaults: null`: it is listed as "coming soon" and can't be picked until #136 adds its
  inputs. A unit test checks that every bucket has a savable kind and every default parses.
- **Amounts and shares are parsed as strings** (`parseRupees`, `parsePercent`), so the form never
  runs a float into paise or bps.
- **Owned by** lists the viewer ("Me") plus every member with a profile. Ticking someone
  resets to an even split (the odd bps go to the first). The remainder chip reads
  "N% left" / "Over by N%", and Save is disabled until the shares sum to 100%.

## Consequences

- #136 replaces the defaults with real inputs, and enables the remaining kinds and edit.
- Members who haven't set a name don't appear in the split until they do.
