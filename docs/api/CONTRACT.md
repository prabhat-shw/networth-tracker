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
| GET | `/api/household/keys` | Wrapped-key blobs for the current member |
| POST | `/api/household/invite` | Store a wrapped HDK blob for an invitee |
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
`pnpm auth:invite <email>` (owner bootstrap); the in-app invite endpoint arrives with #38.

Record envelope: `{ id, householdId, version, updatedAt, ciphertext, deleted }`.

Filled in properly during M2 — treat the table above as the shape, not the spec.
