# ADR-0033 — Passkey slots in the identity vault (PRF-derived wrap)

**Status:** Accepted · 2026-09-28 · issue #74 (part of #48; `area:crypto`, owner approval) · extends [ADR-0018](0018-identity-vault-and-recovery-code.md), [ADR-0022](0022-identity-vault-relay.md)

## Context

#48 wants "Unlock with Face ID / passkey". The WebAuthn PRF extension gives each passkey a
32-byte secret per (credential, salt) that only its authenticator can reproduce. Unlocking
the private key with it means another wrap of that key, which is a vault format change.
The session key is non-extractable (ADR-0024), so a new wrap can only be made from an
extractable copy: the fresh key at first run, or a passphrase unwrap.

## Decision

- **One slot per passkey**, `{ credentialId, prfSalt, wrap }`, up to **5**. `prfSalt` is 32
  random bytes per slot (the PRF input). Wrap key = HKDF-SHA256(ikm = PRF output,
  salt = prfSalt, info = `nwt/identity/v2|passkey|` ‖ credentialId) → non-extractable
  AES-256-GCM. AAD = that label ‖ u16 id length ‖ credentialId ‖ public key; envelope kid
  `passkey`. A wrap moved to another credential, vault or slot fails closed (`DecryptError`).
- **The PRF output is never stored or sent.** Credential id and salt are public, and the
  server may see them (the wire form carries them), the same as it sees the public key.
- **Vault wire v2** = v1 + `passkeys: [1..5 slots]`. A vault with no passkeys is still
  written as **v1**, byte-identical, so it stays readable by clients that predate v2. The
  decoder accepts both, rejects v2 with an empty list, duplicate ids, credential ids outside
  16–1023 B (WebAuthn's limits), a salt ≠ 32 B, a wrap > 512 B or extra fields.
- **Size limit** `MAX_VAULT_JSON_BYTES` 4 KiB → **12 KiB** (5 slots with the longest ids fit;
  a test builds that vault). The server uses the same constant.
- **Enrolment API:** `createIdentity` returns `enrolPasskey` (first run, no second
  passphrase prompt; the caller drops it when first run ends); `addPasskeySlot(vault,
  passphrase, prf)` for right after a passphrase unlock. Re-enrolling a credential
  replaces its slot. `removePasskeySlot` revokes one; `unlockWithPasskey` opens one.
- **Passkey slots survive** a passphrase change and a recovery restore (they wrap the same
  key). Revoking a lost device's passkey is an explicit `removePasskeySlot`.
- **Bounds live in `wire.ts`** with `KDF_BOUNDS`. `wire.ts` keeps type-only imports: the test
  KDF mock (ADR-0028) imports it, and a runtime import back into `kdf.ts` deadlocked it.

## Consequences

- #75 builds the WebAuthn PRF ceremony, the unlock screen and both enrolment moments on this.
- An enrolled passkey is as good as the passphrase for this vault: whoever can use it
  (device unlock + biometrics) can open the identity. That is the point of
  fast unlock; the passphrase and recovery kit remain the only ways to add new slots later.
- Old clients reading a v2 vault fail closed with `VaultFormatError`; they must update.

## Alternatives rejected

- **Salt derived from the public key** (no stored salt): saves 43 bytes, but a per-slot
  random salt keeps two passkeys' inputs independent and lets a slot be re-keyed alone.
- **Always write v2:** would break every not-yet-updated client for users with no passkey.
