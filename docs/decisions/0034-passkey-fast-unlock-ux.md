# ADR-0034 — Passkey fast unlock: ceremony, fallback and enrolment

**Status:** Accepted · 2026-09-28 · issue #75 (part of #48; `area:crypto`, owner approval) · builds on [ADR-0033](0033-vault-passkey-slots.md), [ADR-0024](0024-lock-unlock-session.md)

## Context

ADR-0033 added passkey slots to the vault. This decides how the browser gets a PRF output,
what the unlock screen does with it, and when a slot is enrolled. The owner chose both
enrolment moments: first run and right after a passphrase unlock.

## Decision

- **Local ceremony** (`src/features/lock/passkey-prf.ts`): `navigator.credentials.get` with a
  random challenge nobody verifies. The assertion is used only for its PRF output and never
  goes to the server. `userVerification: "required"` always, because authenticators derive a
  different PRF secret with and without UV. Unlock asks for the vault's credentials with
  `evalByCredential` (each slot's own salt); enrolment asks for any passkey of this site with
  a fresh salt.
- **Unlock screen** (UX.md §3.1): with a slot in the vault and a browser that may do PRF,
  "Unlock with Face ID / passkey" is primary and "Use passphrase instead" expands in place.
  After **2** failures (cancelled, wrong or unknown passkey), the passphrase field opens with
  a note. A passkey that returns no PRF output switches to the passphrase **without an
  error**. `getClientCapabilities()` saying no PRF, or no WebAuthn, shows the passphrase only.
- **First-run enrolment:** after "Add passkey" registers the sign-in passkey (Better Auth), a
  second prompt gets a PRF output and `createIdentity().enrolPasskey`
  adds the slot; the vault is uploaded again. Best effort: any failure leaves passphrase
  unlock and the later offer. The enrol function is dropped when first run ends.
- **After a passphrase unlock:** the session keeps `{ vault, passphrase }` in its closure for
  **2 minutes**, cleared on lock, use or dismissal, never in React state, storage or a request.
  The gate shows a one-time offer before the household gate. "Use a passkey" → ceremony →
  `addPasskeySlot` → upload; "Not now" is remembered per device (`nwt.fastUnlock`), as is
  success. A passkey unlock never opens this window.
- The session sets the enrol window **before** telling listeners it is unlocked, so the gate
  sees it on the first render.

## Consequences

- Two biometric prompts at first run on PRF-capable devices (register, then evaluate).
- The passphrase string lives in memory up to 2 min longer than before. JS cannot zero it;
  the exposure is the same process that already holds the unlocked keys.
- A later Settings screen owns removing a slot or re-offering fast unlock; `removePasskeySlot` exists.

## Alternatives rejected

- **PRF only during registration:** Better Auth's `addPasskey` can pass `extensions` and
  return `clientExtensionResults`, but many authenticators report only `prf.enabled` at
  create time, so the `get()` prompt is needed anyway. Using a create-time result when one
  comes back, to save the second prompt, is a possible follow-up.
- **Offer on the unlock screen itself:** the gate replaces it as soon as the session unlocks.
- **Holding the extractable private key instead of the passphrase:** needs a new vault API
  for no real gain, since the passphrase unwraps that key anyway.
