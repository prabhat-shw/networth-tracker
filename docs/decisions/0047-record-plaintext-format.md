# ADR-0047 — Record plaintext format, tombstone binding and replay checks

**Status:** Accepted · 2026-10-12 · issue #115 · builds on [ADR-0013](0013-crypto-primitives-and-envelope.md), [ADR-0045](0045-sync-versioning-cursor-limits.md)

## Context

ADR-0045 fixed the wire format: a client-set `version`, LWW inside the plaintext, and
256-byte padding. It left the bytes inside the envelope open. Three gaps also needed closing.
The envelope's plain `deleted` flag is not covered by the AAD. The ADR-0013 `kid` is a label
GCM does not authenticate. And a stale envelope still decrypts under its own `(id, version)`.

## Decision

- **Plaintext** = UTF-8 JSON `{ f: 1, deleted, type, schemaVersion, data, modifiedAt,
  modifiedBy }`, padded with ISO/IEC 7816-4 (`0x80`, then zeros) to the next multiple of 256
  bytes, always with ≥ 1 pad byte. `f` is the plaintext format and lets a future change be
  detected. Its rules:
  - `type`: 1–64 characters.
  - `schemaVersion`: a positive integer.
  - `data`: any JSON; `undefined` is stored as `null`.
  - `modifiedAt`: `Date#toISOString()` (ms, `Z`).
  - `modifiedBy`: the editor's lowercase user id.
- **`deleted` is sealed inside** and must equal the envelope's flag. A server that flips the
  flag, turning a record into a tombstone or reviving one, is caught by a decode failure.
- **The kid must match.** `decodeRecord` refuses an envelope whose `kid` differs from the
  HDK's. Under rotation, the caller picks the key by kid first.
- **Replay:** `decodeRecord(hdk, sealed, knownVersion)` refuses `version < knownVersion`.
  The caller passes the highest version it holds for that id (#116/#117). An equal version
  passes, because a re-pull is normal.
- **Fail closed:** every failure is the opaque `DecryptError`. That covers a wrong key, a
  swapped id or version, a kid mismatch, bad padding, invalid UTF-8 or JSON, a wrong `f`,
  invalid content and a `deleted` mismatch.
- **LWW** (`src/domain/lww.ts`, pure): the later `modifiedAt` wins (fixed-width ISO, so string
  order is time order). A tie goes to the greater `modifiedBy`. Identical stamps keep the
  local copy. A tombstone is an ordinary write, so a later delete beats an edit and a later
  edit revives a delete.

## Consequences

- Records under ~200 bytes of JSON are the same length on the wire, whatever their type.
- `src/crypto/record-codec.ts` is the only place records are sealed or opened. UI code never
  calls `seal`/`open` for records directly.
- The `aead.ts` comment that claimed the kid was authenticated is corrected. The envelope
  format is unchanged.
- Reviving a deleted record by a later edit is by design. The UI (M3) decides whether to offer it.

## Alternatives rejected

- **Putting `kid` or `deleted` into the AAD:** this changes the ADR-0013 AAD and every
  existing envelope, while a check after decryption gives the same guarantee.
- **A binary/CBOR plaintext:** smaller, but JSON is easier to debug and already within one
  256-byte block for small records.
- **Delete-wins (tombstones always win):** it diverges from plain LWW and makes "undo
  delete" impossible.
