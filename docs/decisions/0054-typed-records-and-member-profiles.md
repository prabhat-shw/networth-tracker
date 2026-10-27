# ADR-0054 — Typed records layer and member profiles

**Status:** Accepted · 2026-10-27 · issue #132 · builds on [ADR-0050](0050-sync-wire-up.md), [ADR-0051](0051-record-types-and-common-fields.md)

## Context

`useRecords()` (ADR-0050) hands screens untyped `PlainRecord`s. Screens need typed assets,
liabilities, goals and member names. They also need writes that can't seal invalid data or
save over a record this build doesn't fully understand. The server knows members only as
`{ userId, publicKey, joinedAt }` (ADR-0031), so names have to travel encrypted.

## Decision

- **One registry**, `RECORD_CODECS` (`src/domain/records/typed.ts`) = the asset and liability
  codecs + `GOAL_CODEC` + `MEMBER_CODEC`. `typeRecords()` reads every record through
  `readRecord` and sorts the results into per-type lists of `Entry { id, modifiedAt, modifiedBy, result }`.
  An invalid or too-new record stays in its type's list as an error entry (UX §3.4), so one
  bad record never hides the rest. Unknown types go in `unknown`, kept and never written.
- **Hooks** (`src/features/sync/typed-records.ts`): `useAssets`, `useLiabilities`,
  `useGoals`, `useMembers` (profiles by member id), `useOwnProfile`, `useRecordWriter`.
- **Validated writes**: `prepareWrite(type, data, existing?)` throws `InvalidRecordError`
  (paths and rules, no values) before `sync.write` when the data fails its schema, when
  allocations exceed the value, or when the stored record under that id is another type or
  not `canOverwrite`. It returns the codec's `current` version, and `sync.write` now takes
  `schemaVersion` instead of always writing 1. Deletes are always allowed (tombstone, no data).
- **`member` record** v1: `{ memberId, name (≤40), colour? }`. Each member writes their own.
  A profile counts only if `memberId === modifiedBy`, so one member can't rename another
  (that profile becomes an error entry). The latest valid profile per member wins. The
  prompt updates the member's existing record in place.
- **Record ids stay random**, also for profiles. An id derived from the user id would tell
  the server which record is whose profile, which leaks the type.
- **Name prompt**: Home asks "What should your household call you?" until a name is set,
  and afterwards shows "You appear as … · Change".

## Consequences

- An owner with no valid profile shows as `FORMER_MEMBER` ("Former member"). Accounts (#137)
  and Home (#138) use it.
- Two devices of one member that save at once may leave two profile records. Reads take the
  latest, and the next rename updates that one. The other stays as a harmless duplicate.
- A member can still tombstone another's profile (deletes are always allowed). Their name
  then reads "Former member" until they save it again. Acceptable for one household.

## Alternatives rejected

- **Record id = user id:** makes it impossible to have duplicates, but leaks to the server
  that the record is a profile.
- **Names on the server (Better Auth `name`):** plaintext on the server; ADR-0031 keeps it empty.
