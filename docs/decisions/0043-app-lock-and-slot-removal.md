# ADR-0043 — App lock toggle and removing vault slots

**Status:** Accepted · 2026-10-11 · issue #102 (split from #91, `area:crypto`, owner approval) · builds on [ADR-0037](0037-onboarding-v2-key-on-device.md), [ADR-0038](0038-vault-v3-device-slot.md)

## Context

ADR-0037: app lock off = this device keeps a device slot and opens silently; app lock on = no
device slot, every session unlocks with a passkey or the passphrase. Settings → Security
(#103) needs the crypto to flip it, and to remove methods while keeping ≥ 1 recovery method.
ADR-0038 left two gaps: a device that signed in with a passphrase or passkey can't build a
device slot (its session key is non-extractable), and no slot can be removed safely.

## Decision

- **App lock is the device slot.** No separate preference: off ⇔ a slot exists in this
  browser for this user. **On** = `DeviceSlotStore.clear()`, which forgets the device key, so
  IndexedDB holds no key material at all. **Off** = build a fresh slot and save it.
- **Turning it off asks again.** `deviceSlotByPassphrase(vault, passphrase)` and
  `deviceSlotByPasskey(vault, prf)` unwrap an *extractable* copy of the private key from that
  vault slot, wrap it under a new device key and drop it. A lowered protection level should
  be confirmed by the person anyway; and holding an extractable key or the passphrase for
  the whole session (to skip the prompt) would widen what a page compromise could take.
- **Extractable unwraps** are exported for this only: `privateKeyByPassphrase` (`vault.ts`)
  and `privateKeyByPasskey` (`vault-passkey.ts`), documented "re-wrap, never keep". Both
  fail closed with `DecryptError`, like every other unwrap.
- **Removing slots:** `removePassphraseSlot` (clears `kdf` too), `removeRecoverySlot`, and the
  existing `removePasskeySlot`. Each goes through `keepRecovery(before, next)` in `wire.ts`,
  which throws `LastRecoveryMethodError` when the result would have no recovery method but the
  original had one. The device slot never counts: it isn't in the vault and dies with the
  browser. A vault that never had one (first run) is left to ADR-0040's rule.

## Consequences

- No wire, server or IndexedDB format change. #103 wires the UI: the toggle, a re-auth
  prompt, and removal with `putVault`.
- **Server guard** (#108): `PUT /api/identity/vault` refuses with `409 recovery-required` an
  upload that drops the last recovery slot of a stored vault that had one, atomically in
  the upsert (`jsonb_exists_any` on the canonical stored JSON). A slotless vault over a
  slotless one (first-run retry) is still accepted.
- Tests: `src/crypto/vault-slots.test.ts`; IndexedDB is empty after app lock on
  (`device-store.browser.test.tsx`).

## Alternatives considered

- **Keep the extractable key in the session** to turn app lock off without a prompt:
  rejected, see above.
- **A stored app-lock preference** separate from the slot: two sources of truth that can
  disagree after site data is cleared.
