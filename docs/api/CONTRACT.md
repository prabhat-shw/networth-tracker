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
| POST | `/api/auth/*` | Better Auth (passkey register/authenticate, email OTP, session) |
| GET | `/api/household/keys` | Wrapped-key blobs for the current member |
| POST | `/api/household/invite` | Store a wrapped HDK blob for an invitee |
| POST | `/api/sync/pull` | `{ sinceVersion }` → `{ records[], serverVersion }` |
| POST | `/api/sync/push` | `{ records[] }` → `{ applied[], conflicts[] }` (409 on stale version) |
| PUT | `/api/blobs/:id` | Encrypted attachment upload (statements, receipts) |
| GET | `/api/prices/universe/:kind/:date` | Public price universe (no auth-scoped filtering) |

Record envelope: `{ id, householdId, version, updatedAt, ciphertext, deleted }`.

Filled in properly during M2 — treat the table above as the shape, not the spec.
