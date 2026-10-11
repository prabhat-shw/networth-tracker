# ADR-0037 — Onboarding v2: email → in; key on device; protect before the first data

**Status:** Accepted (plan) · 2026-10-11 · owner decision · issues #88–#92 (#88: [ADR-0038](0038-vault-v3-device-slot.md)) · supersedes in part [ADR-0024](0024-lock-unlock-session.md), [ADR-0025](0025-onboarding-flow.md), [ADR-0027](0027-first-run-implementation.md), [ADR-0034](0034-passkey-fast-unlock-ux.md)

## Context

The owner, testing M1 on staging, found onboarding too long: email → code → passphrase →
24-word kit → type two words → passkey (two prompts) → app. The goal: getting in is
"email code (or magic link) and done"; security is secondary, chosen by the user and
nudged with clear risk messages. The server must still never be able to read data.

## Decision

- **Sign-in:** email code (today) **plus magic link**; Google later (#93: needs a public
  redirect origin; production is Tailscale-only). Invite-only stays.
- **First run = nothing.** After sign-in the device creates the identity key and the
  household silently and opens the app. No passphrase, kit or passkey step.
- **Key on device ("device slot").** A non-extractable AES-GCM *device key* lives in
  IndexedDB, and the vault's private key is wrapped under it. A non-extractable private
  key alone could never be re-wrapped into new slots, hence the extra layer. The browser is
  asked for persistent storage (`navigator.storage.persist()`), and iOS users get an "Add to
  Home Screen" hint (Safari evicts site data after 7 days unused).
- **Vault v3:** the passphrase, recovery and passkey slots are all **optional**. The server
  can see *which* slots exist (never their contents), so it can enforce the next rule.
- **Protect before the first data.** The first record write (M2 push) or invite needs at
  least one **recovery method**: passkey (PRF), passphrase or recovery kit. The client shows a
  chooser at that moment. The **server refuses** the write or invite while the vault has no
  recovery slot. So no data ever exists that only the device could open.
- **App lock = the M1 model.** With app lock on, no device slot is kept: each session
  unlocks with Face ID / passkey or the passphrase, and auto-lock is 5 min. With it off, the
  device slot opens the app silently. **On by default when the user picks Face ID**; optional
  otherwise. Settings → Security toggles it and adds or removes methods (≥ 1 recovery method
  always).
- **Banner** (persistent, one line of risk each) until all of these hold: a recovery method
  (always true once data exists), a second method or a *synced* passkey (WebAuthn
  backup-state flag), and app lock on.

## Consequences

- SECURITY.md changes: with app lock **off**, a stolen device's disk can yield the key.
  The browser protects IndexedDB, but no passphrase stands in the way. This is accepted as
  user-chosen convenience, with a banner.
- M1 tests change: the "keys never in IndexedDB" assertions become "only a non-extractable
  device key and wrapped bytes, and none at all with app lock on".
- Recovery still works as before: methods are stored server-side as wrapped slots, so any
  device recovers with one method; the spouse re-share stays the last resort.
- A synced passkey makes "new device → Face ID → in" a single step.

## Alternatives rejected

- **Server-held key (escrow)**, so a code alone works on new devices: the server could read
  data. That breaks the product's core promise.
- **Keep the passphrase mandatory, only trim steps:** too little; the owner wants
  "email and done".
- **Extractable private key in IndexedDB:** JS-readable key bytes; the device slot gives
  the same convenience without them.
