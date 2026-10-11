# ADR-0038 — Vault v3 (optional slots) and the device slot

**Status:** Accepted · 2026-10-11 · issue #88 (`area:crypto`, owner approval) · implements part of [ADR-0037](0037-onboarding-v2-key-on-device.md) · extends [ADR-0018](0018-identity-vault-and-recovery-code.md), [ADR-0033](0033-vault-passkey-slots.md)

## Context

ADR-0037 makes first run ask for nothing: the identity must open on this device with no
passphrase, and a recovery method is added later, without asking for anything else. The
v1/v2 vault requires the passphrase and recovery slots, and a non-extractable session key
cannot be re-wrapped into new slots.

## Decision

- **Vault v3 on the wire:** `{ v: 3, publicKey, kdf?+byPassphrase?, byRecovery?, passkeys? }`.
  Each slot is optional; `kdf` and `byPassphrase` travel together; `passkeys`, when present,
  is non-empty. v3 is written **only when a slot is missing**: a vault with both slots still
  encodes as v1 (or v2 with passkeys), byte-identical. The decoder rejects a v3 that has both
  slots, so every vault has one canonical form. Same bounds and 12 KiB limit as before.
- **In memory** `IdentityVault.v = 3` with `kdf`, `byPassphrase`, `byRecovery` nullable. Every
  call that needs a missing slot (passphrase unlock or change, kit restore, kit rotation)
  fails closed with `DecryptError`.
- **Device slot** (`src/crypto/vault-device.ts`): `{ key, publicKey, wrap }`. `key` is a
  non-extractable AES-256-GCM key (`wrapKey`/`unwrapKey` only); `wrap` is the private key,
  envelope kid `device`, AAD `nwt/identity/v3|device|` ‖ public key. It is **not part of the
  vault and never uploaded**. The slot can unwrap an *extractable* copy in memory, which is
  what lets `addPassphraseFromDevice`, `addRecoveryKitFromDevice` and `addPasskeyFromDevice`
  add recovery slots with no other secret. An extractable device key, another identity's
  vault or any tampering fails closed.
- `createDeviceIdentity()` is the silent first run: identity + slotless vault + device slot.
- **Storage** (`src/features/lock/device-store.ts`): IndexedDB `nwt-device` / `slots`, one
  record per user id, holding exactly the three fields (the `CryptoKey` is structured-cloned,
  so it stays non-extractable). Saving refuses an extractable key and requests
  `navigator.storage.persist()` (best effort).
- **Slot presence:** `vaultSlots()` → `{ passphrase, recovery, passkeys }` and
  `hasRecoveryMethod()`; the server's `storedVaultSlots(db, userId)` reads them from the
  stored vault for #90's "no data or invite without a recovery method" rule. `PUT
  /api/identity/vault` accepts v3, including a vault with no slots.

## Consequences

- Clients from before this change fail closed (`VaultFormatError`) on a v3 vault; users who
  only ever had v1/v2 vaults are unaffected.
- A device that signs in with a passphrase or passkey can't build a device slot yet (the
  session key is non-extractable); #91 adds that when app lock is turned off.
- Removing the passphrase or kit slot is left to #91 (Settings → Security).

## Alternatives rejected

- **Device wrap inside the vault:** useless to any other device, and it tells the server
  how many devices exist.
- **Store the private key itself non-extractable:** it could never be re-wrapped into a
  recovery slot (ADR-0037).
- **Always write v3:** would break clients not yet updated, for no gain.
