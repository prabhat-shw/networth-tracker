# ADR-0041 — Silent first run and returning on the device slot

**Status:** Accepted · 2026-10-11 · issue #97 (with #96, closes #89) · implements part of [ADR-0037](0037-onboarding-v2-key-on-device.md) · supersedes the first-run steps of [ADR-0027](0027-first-run-implementation.md)

## Context

ADR-0037 makes onboarding "email and done": no passphrase, no kit, no passkey step. ADR-0038
gives the device slot, and ADR-0040 asks for a recovery method at the first invite or data.
This ADR records how the gate and first run now behave.

## Decision

- **First run asks nothing.** `createDeviceIdentity` → **save the device slot** → upload the
  slotless v3 vault → create the household (or wait, if invited) → start the session. The
  slot is saved *before* the upload, so the server never holds a vault that no device can
  open. A failed step offers **Try again**, which reuses the same identity (the server refuses
  a second public key for the account), and the slot is saved only once.
- **The device slot is keyed by user id** in IndexedDB (`nwt-device`), so two accounts in
  one browser never share one. The gate loads it with the vault and uses it only if its
  public key matches the vault's.
- **Returning on this device = no unlock.** With a matching slot, the gate opens the key
  silently whenever the session is locked. Auto-lock still runs but just reopens it: this
  is the "app lock off" model. Without a slot (another device, or app lock on after Face ID),
  the gate shows Unlock as before. A vault with no recovery slot on a device without its
  slot gets a plain explanation instead of an Unlock screen that can't work.
- **`RecoveryContext`** comes from the gate while the device slot is open: `saveVault` uploads
  and keeps the new vault; `dropDeviceSlot` clears IndexedDB and switches to the Unlock model.
- **Storage hint** (`InstallHint`), only while the key lives in the device slot: iOS Safari
  outside a Home Screen app → "Add to Home Screen" (Safari evicts site data after 7 days
  unused); elsewhere, if `navigator.storage.persisted()` is false → a one-line risk. "Got
  it" dismisses it for good on this browser.
- **E2E (M1 acceptance) follows the new flow:** A protects with a kit at the first invite
  and later restores with it on a fresh profile; IndexedDB may now hold `nwt-device` and
  nothing else.

## Consequences

- First run is one screen ("Setting up on this device…") and zero taps; the tap budget for
  code → Home drops from 4 to 0.
- The old passphrase/kit/passkey first-run steps are gone from the code. The kit screen lives
  on in the recovery chooser (ADR-0040).
- With app lock off, whoever can use this browser profile can open the app. ADR-0037 accepts
  this as the user's choice; the banner comes with #91.

## Alternatives rejected

- **Upload the vault first, then save the slot:** a failed save would leave an account whose
  only key is gone.
- **Key the slot by email:** puts the address in IndexedDB and breaks on an address change.
