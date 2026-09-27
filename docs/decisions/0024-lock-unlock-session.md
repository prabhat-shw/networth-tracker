# ADR-0024 — Lock/unlock session: in-memory keys, 5-minute auto-lock

**Status:** Accepted · 2026-09-27 · issue #7 · builds on [ADR-0018](0018-identity-vault-and-recovery-code.md); passkey unlock split to #48

## Context

Once unlocked, the identity private key and the household key have to live somewhere so
the app can decrypt. A stolen unlocked laptop is in the threat model (SECURITY.md), so
that somewhere must be small, short-lived and emptied on lock. UX.md §3.1 showed the
household name on the unlock screen, but that name is inside encrypted records.

## Decision

- **One key session** (`src/features/lock/key-session.ts`, no React): keys are held only
  in its closure. `state()` returns a plain `{status}` snapshot
  (`locked | unlocking | failed | unlocked`) for rendering, so keys never enter React
  state, storage or a request.
- **Lock drops every key reference.** JS cannot zero a `CryptoKey`; unreachable plus
  non-extractable (the private key is never exportable) is the best a browser allows.
  A generation counter discards an unlock whose Argon2id finishes after a lock.
- **Auto-lock:** 5 minutes without activity by default (owner decision). Activity is
  pointer, key, wheel and touch. Timers are throttled in background tabs and stop while a
  laptop sleeps, so the elapsed time is also checked on activity and when the tab becomes
  visible again. Activity after the window has closed locks instead of extending it.
- **`pagehide` locks.** The back/forward cache can otherwise restore a page with its keys
  in memory. Closing the tab destroys the heap anyway.
- **Unlock screen** shows the signed-in email, not the household name (owner decision):
  it is known without decrypting and is not household data. The passphrase is read from
  the form on submit and the form is reset, so it is not kept in component state.
- **Passkey PRF fast unlock** is split out to #48 (a vault format change).

## Consequences

- The strings the user typed may linger in JS memory until garbage collection; there is
  no API to wipe them. Accepted, as for every web app.
- Auto-lock length becomes a Settings option later; `createKeySession({autoLockMs})`
  already takes it.
- Mounting the screen (session → vault fetch → unlock → app) is #45's onboarding flow.
