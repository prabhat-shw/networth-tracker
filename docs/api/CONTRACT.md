# API contract (v0 — draft, finalised in M2)

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
| GET | `/api/households/:householdId/records?since=N` | Member only; see *Authorisation* below |
| GET/PUT | `/api/identity/vault` | Own identity vault; see *Identity vault* below |
| GET/POST | `/api/households` | My households and whether I'm invited; create a household with my own wrap. See *Household members* |
| GET/POST | `/api/households/:householdId/members` | Own wrap + members' public keys; relay a wrap to an invitee |
| GET/POST/DELETE | `/api/households/:householdId/invites` | List open invites; invite an email; cancel an invite |
| DELETE | `/api/households/:householdId/invite` | The invitee declines their own invite |
| POST | `/api/sync/pull` | `{ sinceVersion }` → `{ records[], serverVersion }` |
| POST | `/api/sync/push` | `{ records[] }` → `{ applied[], conflicts[] }` (409 on stale version) |
| PUT | `/api/blobs/:id` | Encrypted attachment upload (statements, receipts) |
| GET | `/api/prices/universe/:kind/:date` | Public price universe (no auth-scoped filtering) |

## Auth (ADR-0020)

Better Auth under `/api/auth`, paths as Better Auth 1.7 defines them. Session cookie
`__Secure-better-auth.session_token` (httpOnly, secure, SameSite=Lax). All POSTs need an
`Origin` equal to `APP_ORIGIN`. Rate-limited per IP; over the limit → `429`.

| Method | Path | Body → result | Limit |
| --- | --- | --- | --- |
| POST | `/email-otp/send-verification-otp` | `{ email, type: "sign-in" }` → `200` always; a code is mailed only to a registered or invited address | 3 / 5 min |
| POST | `/sign-in/email-otp` | `{ email, otp }` → `200` + session cookie; creates the account on first sign-in **only with an open invite** (else `403`) | 5 / 5 min |
| GET | `/passkey/generate-register-options` | session required → WebAuthn creation options | 30 / min |
| POST | `/passkey/verify-registration` | session required; `{ response, name? }` → passkey stored | 30 / min |
| GET/POST | `/passkey/generate-authenticate-options` | → WebAuthn request options | 30 / min |
| POST | `/passkey/verify-authentication` | `{ response }` → `200` + session cookie | 10 / min |
| GET | `/get-session` | → `{ session, user }` or `null` | 30 / min |
| POST | `/sign-out` | clears the session | 30 / min |

Not available: `/sign-up/email` or any password or social route. Invites are created by
`pnpm auth:invite <email>` (owner bootstrap) and by the in-app household invite below.

## Identity vault (ADR-0022)

Session required (`401`); always the caller's own vault. Body is the vault wire form:

```json
{ "v": 1, "publicKey": "<b64url 65 B>", "byPassphrase": "<b64url>", "byRecovery": "<b64url>",
  "kdf": { "alg": "argon2id", "memoryKiB": 65536, "iterations": 3, "parallelism": 1, "salt": "<b64url>" } }
```

- `GET` → `200` vault (`cache-control: no-store`), or `404` before the first upload.
- `PUT` (`content-type: application/json`, ≤ 4 KiB) → `204`. `400` wrong shape or KDF
  params outside memory 19 MiB–1 GiB, iterations 2–10, parallelism 1–4, salt 16–64 B;
  `409` if `publicKey` differs from the stored one (immutable); `413`; `415`.
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
  invite and the sign-up invite for that address.
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

`GET /api/households/:householdId/records?since=N` (`N` a non-negative integer, default 0;
otherwise `400`) → `200 { records: RecordEnvelope[] }` with `version > N`, ascending,
at most 500; page by passing the last `version` seen. `cache-control: no-store`.

Record envelope: `{ id, householdId, version, updatedAt, ciphertext, deleted }` —
`updatedAt` ISO-8601, `ciphertext` base64url.

Filled in properly during M2 — treat the table above as the shape, not the spec.
