# ADR-0044 — Settings → Security

**Status:** Accepted · 2026-10-11 · issue #103 (split from #91) · uses [ADR-0043](0043-app-lock-and-slot-removal.md), [ADR-0040](0040-recovery-method-before-first-data.md), [ADR-0042](0042-protection-banner.md)

## Context

ADR-0037 promises a Security screen to switch app lock and add or remove ways back in.
ADR-0043 gives the crypto. This records the UI rules that are not obvious from it.

## Decision

- **Route `/settings`**, a second App Router page wrapped in its own `AppGate`. The key
  session is a module singleton, so client navigation (`next/link`) from Home or the
  banner's **Fix** keeps the session; a full reload with app lock on asks to unlock again.
- **`SecurityContext`** from the gate: vault, this device's slot (`null` = app lock on),
  `saveVault`, `keepDeviceSlot`, `dropDeviceSlot`. The older `RecoveryContext` is now this
  source narrowed to "slot present".
- **Confirm it's you** (`reauth.tsx`) whenever there's no device slot to work from: turning
  app lock off (the slot is kept) and adding a method with app lock on (the slot is
  *borrowed*: built in memory, used by the existing chooser, never saved). Passkey first,
  passphrase below; a kit can't confirm, since it can only restore.
- **Two removal limits:** at least one recovery method always (ADR-0043, also enforced by the
  server since #108); and **with app lock on, at least one passkey or passphrase**, since a
  kit alone can't unlock a session. For the same reason, app lock can't be turned on
  without a passkey or passphrase.
- **Lock now** always shown (UX.md §3.9). With app lock off it says the device reopens
  without asking, which is what auto-lock already does.
- Browser tests define `process.env` (`vitest.config.mts`), because `next/link` reads it and
  only Next's bundler inlines it.

## Consequences

- Removing a passkey slot doesn't delete the WebAuthn credential (Better Auth sign-in);
  it just stops unlocking data. Deleting sign-in passkeys can come with account settings.
- The chooser's "Face ID turns app lock on" still applies from Settings when app lock is
  off; with it on, there is nothing to drop.

## Alternatives considered

- **A Settings panel inside Home** instead of a route: no URL for the banner to link to.
- **Kit as re-auth**: restoring from a kit sets a passphrase; a confirmation shouldn't.
