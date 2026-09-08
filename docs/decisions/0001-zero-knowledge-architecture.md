# ADR-0001 — Zero-knowledge architecture

**Status:** Accepted · 2026-09-08

## Context

The app holds a complete household balance sheet: every account, balance, folio number,
PAN, property, and loan. That is a richer target than any single bank holds. It must sync
between the owner's and their spouse's devices, and it will run partly on infrastructure the
owner does not fully trust (Vercel staging today, possibly a rented box later).

The enabling observation: **prices are public, holdings are private.** NAVs, share prices
and FX rates are identical for everyone, so a server can cache them while knowing nothing
about any user, and the device can do all valuation locally.

## Decision

The server never receives plaintext. All records are encrypted client-side with AES-256-GCM
under a household data key before upload. The server stores `{householdId, recordId,
version, updatedAt, ciphertext, deleted}` — not even the record type. Valuation, reporting,
search and statement parsing all happen on-device.

## Consequences

- A full database compromise (or a hostile host) yields random bytes.
- No server-side reports, alerts, or email ingestion — ever. Features must be designed
  client-side or not at all.
- Losing the passphrase *and* recovery kit *and* the spouse's copy means the data is gone.
  There is no password reset that recovers data. This is disclosed in the UI.
- The server becomes small and dumb, which makes the planned Rust rewrite (M9) tractable.
- The client must download whole public price universes so request patterns cannot leak
  holdings (see ADR-0005).
