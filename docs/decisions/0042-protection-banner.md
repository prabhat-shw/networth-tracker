# ADR-0042 — Protection banner and synced-passkey detection

**Status:** Accepted · 2026-10-11 · issue #101 (split from #91) · implements the banner of [ADR-0037](0037-onboarding-v2-key-on-device.md)

## Context

ADR-0037 lets a person use the app with the key only on this device and app lock off. It
promises a persistent banner, one line of risk for each gap, until three things hold: a
recovery method, a second method or a *synced* passkey (WebAuthn backup-state flag), and app
lock on. #91 was split into the banner (this ADR), the app-lock and slot-removal crypto (#102)
and Settings → Security (#103).

## Decision

- **Rules are pure** (`src/features/lock/protection.ts`): `risks({ slots, syncedPasskey,
  appLock })` returns up to two lines. With no method at all it asks for the *first*
  (`no-recovery`), not a second. One method that is not a synced passkey gives
  `single-method`. A device slot on this device means app lock is off (`app-lock-off`).
- **Synced = the BS flag**, bit 4 of the flags byte in the authenticator data of a passkey
  assertion. Every enrol and unlock ceremony reads it and stores `{credentialId: bool}`
  in `localStorage` (`nwt.syncedPasskeys`). **Not in the vault:** that would change the
  wire format (area:crypto) to cache a hint the authenticator can restate on each use, and
  the flag can change (a passkey can start syncing later). On a new device the passkey is
  "not known to be synced" until its first use there. That only shows the banner more often.
- **Banner** (`protection-banner.tsx`) sits above the app inside the gate, once unlocked.
  **Not now** hides it for this browser session (`sessionStorage`), for that exact set of
  risks: a new gap brings it back. It never blocks the app.

## Consequences

- No server or wire change. The stored map holds public credential ids and a boolean.
- Until #103 ships, the banner has no "Fix" link; the recovery chooser (ADR-0040) and the
  passkey offer are the ways to close gaps. #103 adds the link to Settings → Security.
- Clearing site data forgets the flags; the next passkey use restores them.

## Alternatives considered

- **BS flag in the passkey slot:** syncs across devices, but changes the vault wire format
  and goes stale. Rejected for now. Revisit if the banner proves noisy on new devices.
- **Dismiss forever:** the gaps are real risks to the data. ADR-0037 asks for persistence.
