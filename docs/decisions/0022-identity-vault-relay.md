# ADR-0022 — Identity vault relay: wire codec, KDF bounds, immutable public key

**Status:** Accepted · 2026-09-27 · issue #38 (split from #6; member relay is #43) · builds on [ADR-0018](0018-identity-vault-and-recovery-code.md), [ADR-0021](0021-household-authorisation.md)

## Context

A member must be able to unlock on a fresh browser profile with only their passphrase or
recovery code, so the server keeps a copy of the identity vault. The vault is safe to hand
the server (public key, KDF params, two AES-GCM wraps of the private key), but it comes
*back* from a server we do not trust, and its KDF params decide how much memory Argon2id
allocates on the device.

## Decision

- **Wire codec** `src/crypto/wire.ts` (pure, shared by client and server): JSON, bytes as
  unpadded base64url, exact key set, `v: 1`. `decodeVault` throws `VaultFormatError` on
  anything else.
- **KDF bounds on decode:** memory 19 MiB–1 GiB, iterations 2–10, parallelism 1–4, salt
  16–64 bytes, `alg` = argon2id only. The ceiling stops a hostile server from hanging or
  OOM-killing the unlock screen; the floor (OWASP minimum) stops it downgrading the work
  factor of a vault the client later re-wraps. Defaults (64 MiB, t=3, p=1) sit inside, and
  a test keeps them there. Public key must be 65-byte uncompressed SEC1; wraps ≤ 512 bytes;
  whole body ≤ 4 KiB.
- **Storage:** `identity_vaults(user_id PK → user.id cascade, public_key, vault, updated_at)`
  (migration `0005_identity_vaults`). The server validates with the same codec and stores
  the **re-encoded canonical JSON**, so it only ever serves back well-formed vaults.
- **Public key is immutable.** The first `PUT` fixes it; a later `PUT` with another key is
  a `409`, enforced atomically in the upsert (`ON CONFLICT … DO UPDATE … WHERE public_key =
  excluded.public_key`). Every HDK wrap is bound to that key; a swapped key (stolen
  session) would otherwise redirect future invite wraps (#43) to an attacker.
- **Endpoints:** `GET`/`PUT /api/identity/vault`, own vault only (no id in the path, so no
  cross-user access to guard). `401` without session, `404` before first upload, `400` bad
  shape, `413` too big, `415` not JSON, `204` on store.

## Consequences

- A stolen session can still overwrite the wraps under the same public key (denial of
  unlock). The recovery code and spouse re-wrap remain the fallback; rotating the key
  pair is a future, explicit flow.
- Raising KDF defaults beyond the ceiling needs a bounds change first (a test fails).
- Staging needs migration `0005_identity_vaults` (manual, DEPLOYMENT S4).
