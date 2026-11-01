# ADR-0070 — Daily snapshots and their id

**Status:** Accepted · 2026-11-01 · issue #171 · builds on [ADR-0064](0064-prices-and-valuation.md) §8, amends [ADR-0051](0051-record-types-and-common-fields.md) §1

## Context

ADR-0064 §8 settles that one `snapshot` record per household per day feeds the M5 timeline.
Its id is an HMAC of the date under a key derived from the HDK, so every device writes the
same record. WebCrypto can't run HKDF directly from an AES-GCM key. The repo rule is that
the HDK is never exported, except when `wrapKey` wraps it for another member.

## Decision

1. **Id key without exporting the HDK** (`src/crypto/snapshot-id.ts`). The device encrypts
   32 zero bytes under the HDK with AES-GCM and a fixed 12-byte IV, `nwt/snapid/1`. The output
   is the AES-CTR keystream for that IV, a PRF of the HDK. That keystream goes through HKDF-SHA-256
   (salt = household id, info `nwt/snapshot-id/v1`) into a **non-extractable**
   HMAC-SHA-256 key, used only to sign. The id is `HMAC("snapshot|YYYY-MM-DD")` cut to
   16 bytes and formatted as a UUIDv8. Intermediate buffers are zeroed. Record IVs are random
   96-bit values, so the odds of one matching the fixed IV are about 2⁻⁹⁶ per record. Even
   then the keystream stays inside the device.
2. **Type.** `snapshot` joins `RECORD_TYPES` (now six). Data: `date` (IST), `household`,
   `members` (by member id), and `formerMembers`, each holding assets, liabilities and net in
   paise. `buckets` holds Household assets by bucket, and `pricesAsOf`/`stale` come from
   ADR-0068. Assets are valued on read and every lens comes from `allLenses`, so the members'
   figures plus former members add up to Household exactly.
3. **Who writes.** After a sync run succeeds, the device has pulled every snapshot the others
   wrote. The writer derives today's id (IST calendar day) and writes only if no record has
   that id. It first refreshes prices, which does nothing once they are checked today. It
   skips an empty household and a locked session. Once a device knows today's snapshot exists,
   it doesn't check again until the next day.
4. **Races and the tie-break.** Two devices that miss each other write the same id. The
   ordinary record-level LWW (ADR-0045) keeps the later `modifiedAt`, then the greater
   `modifiedBy`. The two copies differ by at most a price refresh, so either is right.
   A snapshot is never edited after that. A deleted one is written again that day.
5. **HDK rotation** (future) gives new ids. A day that spans a rotation may then have two
   snapshots, and the timeline keeps the later stamp for each `date`.

## Consequences

- The server sees one new record a day, and nothing ties it to a date. Traffic volume is
  already an accepted leak (SECURITY.md).
- No backfill: the timeline starts at the first snapshot (UX §3.3). No chart until M5.
- `area:crypto`: the owner approves before merge.
