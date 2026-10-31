# API contract (v1 — records section finalised in M2, ADR-0045)

The server surface is deliberately tiny so it can be reimplemented in Rust (M9) behind the
same contract. Every endpoint here is exercised by the shared contract test suite
(`pnpm test:contract`), which must pass against any implementation.

## Invariants

- No endpoint accepts or returns plaintext household data. Ever.
- All bodies are JSON; ciphertext fields are base64url.
- Auth is a session cookie (httpOnly, secure, SameSite=Lax).

## Endpoints (draft)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | `{ status, app, db }`: 200 when Postgres answers, 503 otherwise. No auth, no secrets (ADR-0011) |
| GET | `/api/version` | Build identity for the stale-build banner (ADR-0009) |
| GET/POST | `/api/auth/*` | Better Auth; see *Auth* below |
| GET/POST | `/api/households/:householdId/records` | Pull by cursor; push with optimistic concurrency. See *Records* below |
| GET/PUT | `/api/identity/vault` | Own identity vault; see *Identity vault* below |
| GET/POST | `/api/households` | My households and whether I'm invited; create a household with my own wrap. See *Household members* |
| GET/POST | `/api/households/:householdId/members` | Own wrap + members' public keys; relay a wrap to an invitee |
| GET/POST/DELETE | `/api/households/:householdId/invites` | List open invites; invite an email; cancel an invite |
| DELETE | `/api/households/:householdId/invite` | The invitee declines their own invite |
| PUT | `/api/blobs/:id` | Encrypted attachment upload (statements, receipts) |
| GET | `/api/prices/universe/:kind/:date` | Public price universe, same bytes for everyone. See *Prices* below |

## Auth (ADR-0020)

Better Auth under `/api/auth`, paths as Better Auth 1.7 defines them. Session cookie
`__Secure-better-auth.session_token` (httpOnly, secure, SameSite=Lax). All POSTs need an
`Origin` equal to `APP_ORIGIN`. Rate-limited per IP; over the limit → `429`.

| Method | Path | Body → result | Limit |
| --- | --- | --- | --- |
| POST | `/email-otp/send-verification-otp` | `{ email, type: "sign-in" }` → `200` always; a code is mailed only to a registered or invited address | 3 / 5 min |
| POST | `/sign-in/email-otp` | `{ email, otp }` → `200` + session cookie; creates the account on first sign-in **only with an open invite** (else `403`) | 5 / 5 min |
| POST | `/sign-in/magic-link` | `{ email }` → `200 { status: true }` always; a one-time link (`APP_ORIGIN/#link=<token>`, 15 min, stored hashed) is mailed only to a registered or invited address ([ADR-0039](../decisions/0039-magic-link-sign-in.md)) | 3 / 5 min |
| GET | `/magic-link/verify?token=` | no `callbackURL` → `200 { token, user, session }` + session cookie; the token works once; creates the account **only with an open invite** (else `403`); a spent/unknown token → `302` with `error=INVALID_TOKEN` | 5 / 5 min |
| GET | `/passkey/generate-register-options` | session required → WebAuthn creation options | 30 / min |
| POST | `/passkey/verify-registration` | session required; `{ response, name? }` → passkey stored | 30 / min |
| GET/POST | `/passkey/generate-authenticate-options` | → WebAuthn request options | 30 / min |
| POST | `/passkey/verify-authentication` | `{ response }` → `200` + session cookie | 10 / min |
| GET | `/get-session` | → `{ session, user }` or `null` | 30 / min |
| POST | `/sign-out` | clears the session | 30 / min |

Not available: `/sign-up/email` or any password or social route. On a server with no users,
the first address to sign in becomes the owner without an invite; that claim happens once per
database ([ADR-0046](../decisions/0046-first-sign-up-owns-empty-server.md)). After it, invites
come from the in-app household invite below, or from `pnpm auth:invite <email>` (admin tool).

## Identity vault (ADR-0022, ADR-0033, ADR-0038, ADR-0043)

Session required (`401`); always the caller's own vault. Body is the vault wire form (v1;
v2 adds `"passkeys": [{ "credentialId", "prfSalt", "wrap" }]`, 1–5 slots, only when the user
has enrolled a passkey; v3 is used only when the passphrase or recovery slot is missing, and
then every slot is optional, e.g. `{ "v": 3, "publicKey": "…" }` right after first run):

```json
{ "v": 1, "publicKey": "<b64url 65 B>", "byPassphrase": "<b64url>", "byRecovery": "<b64url>",
  "kdf": { "alg": "argon2id", "memoryKiB": 65536, "iterations": 3, "parallelism": 1, "salt": "<b64url>" } }
```

- `GET` → `200` vault (`cache-control: no-store`), or `404` before the first upload.
- `PUT` (`content-type: application/json`, ≤ 12 KiB) → `204`. `400` wrong shape or KDF
  params outside memory 19 MiB–1 GiB, iterations 2–10, parallelism 1–4, salt 16–64 B, or a
  passkey slot outside credential id 16–1023 B, PRF salt 32 B, wrap ≤ 512 B, no duplicates;
  `409 { "error": "public key cannot change" }` if `publicKey` differs from the stored one
  (immutable); `409 { "error": "recovery-required" }` if the stored vault has a recovery slot
  (passphrase, recovery or passkey) and the upload has none (ADR-0043, #108; checked
  atomically with the write, nothing changes); `413`; `415`. v3 also
  `400`s `kdf` without `byPassphrase` (or the reverse), an empty `passkeys`, or both
  passphrase and recovery slots (that vault has a v1/v2 form).
- The server reads only which slots exist (`storedVaultSlots`), never their contents; the
  device slot is never sent.
- Clients decode every fetched vault with the same bounds before running Argon2id.

## Household members (ADR-0023)

Bytes are base64url. A wrap is the ADR-0019 blob (first byte `0x01`, 123–378 bytes). POST
bodies: `content-type: application/json` (`415`), ≤ 4 KiB (`413`), exactly the keys
listed (`400`). Member public keys always come from the member's stored vault.

- `GET /api/households` → `200 { households: [{ id, joinedAt }], invited, invites:
  [{ householdId, invitedBy }] }`, the caller's own rows only. `invites` are unexpired
  household invites matching the caller's normalised email for households they aren't in;
  `invitedBy` is the inviter's display name, or their email if they have none. `invited` =
  `invites.length > 0`. `401` without a session; `no-store`. First run routes on it
  (ADR-0025).
- `POST /api/households` `{ id: uuid, wrappedHdk }` → `201 { id }`. `401` no session;
  `409` caller has no vault, or the id is taken; `400` bad id or wrap.
- `GET …/:householdId/members` → `200 { wrappedHdk, members: [{ userId, publicKey,
  joinedAt }] }`. `wrappedHdk` is the caller's own; `no-store`.
- `POST …/:householdId/invites` `{ email }` → `204`. Creates or extends a 14-day household
  invite and the sign-up invite for that address. `409 { "error": "recovery-required" }`
  while the caller's vault has no passphrase, recovery-kit or passkey slot (nothing is
  written; [ADR-0040](../decisions/0040-recovery-method-before-first-data.md)). The record push answers the same (ADR-0045).
- `GET …/:householdId/invites` → `200 { invites: [{ emailHash, expiresAt, invitee }] }`.
  `invitee` is `{ userId, email, publicKey }` once that address has an account and a
  vault, else `null`; `no-store`. Check the key's fingerprint out of band before wrapping.
- `DELETE …/:householdId/invites` `{ emailHash }` (32-byte SHA-256, b64url, **body only**,
  never the URL) → `204`; a member cancels an invite. `404` no such invite; `400` bad hash.
- `DELETE …/:householdId/invite` (no body) → always `204`: the signed-in invitee declines
  their own invite to that household, whether or not one exists. `401` without a session.
- `POST …/:householdId/members` `{ userId, wrappedHdk }` → `201`; consumes the invite.
  `404` no open invite of this household for that user, or they have no vault; `409`
  already a member.

## Authorisation (ADR-0021)

Every household-scoped route runs the membership guard first. No or invalid session →
`401 {"error":"unauthorized"}`. Not a member, no such household, or a malformed id → the
same `404 {"error":"not found"}`, so ids cannot be probed.

## Records (ADR-0003, ADR-0045)

Both routes run the guard above first. The server stores and relays opaque envelopes. It
never merges, and it reads nothing from an envelope except its shape.

**Record envelope:** `{ id, householdId, version, seq, updatedAt, ciphertext, deleted }`
- `id`: a v4 UUID chosen by the client, globally unique.
- `version`: an integer from 1 to 2^53−1, set by the client and bound into the AAD as
  `recordAad(id, version)`.
- `seq`: the server's pull cursor, unique and increasing within a household.
- `updatedAt`: the server's apply time as ISO-8601. It is informational only and never used for merging.
- `ciphertext`: the base64url ADR-0013 envelope.
- `deleted`: `true` marks a sealed tombstone.

**Envelope shape** (checked on push; `400` otherwise; the sealed plaintext is client-only, [ADR-0047](../decisions/0047-record-plaintext-format.md)): decoded length ≤ 64 KiB; byte 0 is
`0x01`; `len − 30 − kidLen` (`kidLen` = byte 1) is a positive multiple of 256. Clients pad
the plaintext to the next multiple of 256 bytes before sealing (`0x80` then zeros, ≥ 1 byte).

### Pull

`GET …/records?since=N`, where `N` is a `seq` from 0 to 15 digits (default 0; otherwise
`400`) → `200 { records: RecordEnvelope[] }`. It returns the envelopes with `seq > N`,
ascending by `seq`, at most 500, with `cache-control: no-store`. To page, pass the last
`seq` you saw. A page shorter than 500 means you are caught up.

### Push

`POST …/records`, `content-type: application/json` (`415`), body ≤ 4 MiB (`413`):

```json
{ "records": [ { "id": "<uuid>", "version": 3, "ciphertext": "<b64url>", "deleted": false } ] }
```

- Use 1–100 records with exactly these keys and no repeated `id`; anything else is `400 {"error":"bad request"}`.
  `version` is the client's base version + 1, so a new record is `1`.
- Runs only after the guard: `409 {"error":"recovery-required"}` if the caller's vault has no
  passphrase, recovery-kit or passkey slot (ADR-0040), and nothing is written.
- `400 {"error":"id taken"}` if any `id` belongs to another household, and nothing is written.
- `400 {"error":"bad request"}` if a record has `version` > 1 but the server has no row for that
  `id` (a base the server never had is a client bug, not a conflict), and nothing is written.
- Otherwise `200`, applied in one transaction:

```json
{ "applied":   [ { "id": "<uuid>", "version": 3, "seq": 812, "updatedAt": "<iso>" } ],
  "conflicts": [ RecordEnvelope ] }
```

  A record is **applied** when the stored version is `version − 1` (no row for `version`
  1). It is then stored with a fresh `seq` and `updatedAt`. Otherwise it is a **conflict**,
  returned as the server's current envelope, and that row is unchanged. To resolve a
  conflict, the client merges with LWW (`modifiedAt`, then `modifiedBy`, both inside the
  plaintext), re-seals at the conflict's `version + 1` and pushes again.
- Pushes to one household are serialised, so concurrent pushes never share a `seq`, and
  `seq` order is commit order.

Contract tests (PGlite, #114): stale base → conflict; cross-household → `404`; no recovery
slot → `409` with nothing written; oversized or unpadded envelope → `400`; concurrent pushes
get distinct, ordered `seq` values.

## Prices (ADR-0064, ADR-0065)

`GET /api/prices/universe/:kind/:date`, `kind` one of `amfi nse bse us crypto fx metal`, `date`
a trading day (`YYYY-MM-DD`) or `latest`. The body is the `universe` file
(`src/domain/prices/universe.ts`). The same bytes go to every caller: the route needs a
session, but never reads whose it is.

- No session → `401`. Unknown kind or no file for that day → `404`. Malformed date → `400`.
- `200` with `ETag`, `Vary: Accept-Encoding`, and the stored gzip as `Content-Encoding: gzip`
  when the client accepts it (plain JSON otherwise).
- A day before today (IST) → `Cache-Control: private, max-age=31536000, immutable`. Today's
  or `latest` → `private, no-cache`; `If-None-Match` with the ETag → `304`.

Contract tests (PGlite, #166): same bytes and ETag for two users; `401` signed out; `304` on a
match; immutable vs no-cache; ingest rejects a file under half the previous count, flags moves
over 50%, writes nothing on a failed fetch, replaces a same-day retry, keeps 400 days.
