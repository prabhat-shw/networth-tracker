# ADR-0018 — Identity vault and recovery code

**Status:** Accepted · 2026-09-26 · refines [ADR-0002](0002-key-hierarchy-and-sharing.md),
builds on [ADR-0013](0013-crypto-primitives-and-envelope.md)

## Context

Issue #4 needs the member's P-256 private key stored so that a passphrase unlocks it, a
printed recovery kit restores it on a fresh browser, and a passphrase change never touches
the household data key (HDK). The stored form must be safe in IndexedDB and on the server.

## Decision

- **Vault shape** (`src/crypto/vault.ts`): `{v:1, publicKey, kdf, byPassphrase, byRecovery}`.
  Only the raw public key, the KDF params and two wraps; no `CryptoKey`, no plaintext.
- **Each wrap** is `wrapKey("pkcs8", privateKey, AES-GCM)` framed as a v1 envelope whose kid
  is the slot (`passphrase` / `recovery`). **AAD = `nwt/identity/v1|<slot>|` ‖ publicKey**,
  so wraps cannot be swapped between slots or grafted onto another public key. All failures
  are `DecryptError`. The private PKCS#8 bytes never enter JS memory.
- **Recovery code = 24 BIP-39 English words** (256-bit entropy + checksum) via
  `@scure/bip39` (MIT, audited, no deps). Full-strength entropy, so **HKDF-SHA-256**
  (salt empty, info `nwt/recovery-key/v1`) derives the key — no Argon2id. Input is forgiven
  for case, spacing and line breaks; a wrong count, word or checksum is a `RecoveryCodeError`
  (safe to report: it says nothing about the vault). The code is returned once and never
  stored or sent.
- **Unlocked private key is non-extractable.** Re-wrapping paths (passphrase change, restore,
  recovery rotation) unwrap a transient extractable copy from the stored vault.
- **Passphrase change** re-wraps `byPassphrase` with a fresh salt at current KDF defaults;
  `publicKey` and `byRecovery` are unchanged, so every HDK wrap stays valid.
- **Restore** needs only the stored vault + code; it sets a new passphrase. The recovery
  code stays valid after use; `rotateRecoveryCode` issues a new one (old one stops working).

## Consequences

- The wire/JSON encoding of the vault and its API endpoint are left to #6 (auth) and
  `docs/api/CONTRACT.md`; the in-memory shape is what IndexedDB stores (structured clone).
- A leaked recovery code = a leaked identity until rotated; the UI (#7) must say so.
- KDF params come from storage; bounding them against a hostile server is a #6 concern.
