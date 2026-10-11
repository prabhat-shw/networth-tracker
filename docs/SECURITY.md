# Security model & threat model

The security model **is** the product. See ADR-0001 (zero-knowledge), ADR-0002 (keys),
ADR-0005 (feed privacy).

## Assets we protect

Household balance sheet (accounts, balances, holdings), identifiers (PAN, folio, account
numbers), statements/attachments, and the *metadata* of all of it (how many accounts, of
what type, with which institutions).

## Adversaries considered

| Adversary | Capability | Mitigation |
| --- | --- | --- |
| Host / cloud operator | Full DB + disk read | Records are AES-256-GCM ciphertext; keys never leave devices |
| Network attacker | MITM, traffic analysis | TLS everywhere; Tailscale-only in production; whole-universe price downloads hide holdings |
| Stolen unlocked laptop | Live session | Auto-lock, keys wiped from memory on lock, passphrase/passkey to unlock |
| Stolen locked device | Disk read | IndexedDB holds ciphertext only; unlock key derived per session, never persisted. Built in #97 ([ADR-0041](decisions/0041-silent-first-run.md)). With app lock off ([ADR-0037](decisions/0037-onboarding-v2-key-on-device.md), [ADR-0038](decisions/0038-vault-v3-device-slot.md)), a non-extractable device key + the wrapped private key are kept in IndexedDB, so disk access yields the key (user's choice, banner [ADR-0042](decisions/0042-protection-banner.md); turning app lock off re-asks for the passphrase or a passkey, turning it on deletes the device key, [ADR-0043](decisions/0043-app-lock-and-slot-removal.md)); with app lock on, unchanged (E2E: no slot in IndexedDB, #92) |
| Malicious dependency | Exfiltration at runtime | Strict CSP (no third-party origins), lockfile + `osv-scanner` + dependency review, no analytics/CDN |
| Malicious statement file | Parser exploit | PDF/CSV parsed in a Web Worker with no network access; pdf.js sandboxed; fuzz-style parser tests |
| Malicious server swaps an invitee's public key | Relays a key it controls | Static-static ECDH wrap + out-of-band key fingerprint check before inviting ([ADR-0019](decisions/0019-household-key-wrapping.md)) |
| Stranger reaching a fresh server | Signs up before the owner | One-time, atomic first-owner claim only while no user exists ([ADR-0046](decisions/0046-first-sign-up-owns-empty-server.md)); production is Tailscale-only; sign in right after the first deploy |
| Curious household member | Legitimate login | Per-record ownership; private (non-shared) records are wrapped only to their owner |
| Us (the developers) | Bugs | Plaintext-scan test on the DB, cross-household E2E isolation test, no PII in logs |

## Controls (enforced in CI)

- gitleaks (secrets), CodeQL/semgrep (SAST), `osv-scanner` + dependency review, SBOM
- Doc-size caps, typecheck, Biome, unit tests
- `src/crypto` known-answer vectors (RFC/Wycheproof/PHC) and fail-closed tests on every PR
  ([ADR-0013](decisions/0013-crypto-primitives-and-envelope.md)); production Argon2id params
  asserted there, while other tests use the bounds floor for speed ([ADR-0028](decisions/0028-fast-kdf-in-tests.md))
- Identity vault tests: the private key is absent from the stored vault, and create /
  change / restore make no `fetch` or IndexedDB call ([ADR-0018](decisions/0018-identity-vault-and-recovery-code.md))
- Device slot ([ADR-0038](decisions/0038-vault-v3-device-slot.md)): the device key is non-extractable before
  and after an IndexedDB round trip; the store holds only key, public key and wrap; another
  identity, an extractable key or tampering fails closed. Missing vault slots fail closed.
- App lock and slot removal ([ADR-0043](decisions/0043-app-lock-and-slot-removal.md)): a slot rebuilt from the passphrase or a passkey
  opens the same key, a wrong one fails closed; app lock on leaves IndexedDB empty; removing
  the last recovery method throws, and the server refuses such a vault upload (PGlite, #108).
- Recovery before first data ([ADR-0040](decisions/0040-recovery-method-before-first-data.md)): the server refuses an invite (409) while the caller's
  vault has no recovery slot (PGlite test); each chooser option's saved vault really opens
  with that option, and Face ID drops the device slot only after the upload (browser tests).
- Passkey slots ([ADR-0033](decisions/0033-vault-passkey-slots.md)): a wrong PRF output, salt or credential, or a wrap moved to
  another credential or vault, fails closed; the PRF output is never in the vault or a request.
  Fast unlock (#75, [ADR-0034](decisions/0034-passkey-fast-unlock-ux.md)): the post-unlock enrol
  window closes on lock, use, dismissal and after 2 min, and never opens after a passkey unlock
- M1 E2E (`e2e/m1-acceptance.spec.ts`, [ADR-0036](decisions/0036-e2e-record-probe.md)): B decrypts A's
  record, restore on a fresh profile, cross-household 404, and no passphrase, recovery phrase or
  record plaintext in any request, browser storage or server table; the E2E-only record probe is
  asserted absent from a normal build
- Onboarding v2 E2E (#92, `e2e/onboarding-v2.spec.ts`): link sign-in lands in the app; with app
  lock off IndexedDB holds exactly one slot (a non-extractable AES-GCM key + public key + wrapped
  bytes), with it on, and on every new device, none; a fresh profile opens with the passphrase
- Vault wire codec rejects out-of-bounds KDF params and malformed vaults; the server stores
  only re-encoded vaults and refuses a public-key change ([ADR-0022](decisions/0022-identity-vault-relay.md))
- Member relay: a wrap goes only to an invitee of that household who has a vault, under
  that vault's public key. The invitee decrypts the creator's record in a PGlite test
  ([ADR-0023](decisions/0023-household-member-relay.md))
- Key session: lock (5-min auto-lock, `pagehide`) leaves no key reachable; an unlock that
  finishes after a lock is discarded ([ADR-0024](decisions/0024-lock-unlock-session.md))
- First run (browser tests): nothing is sent before the recovery kit is confirmed; no
  request, storage or IndexedDB holds the passphrase or recovery words
  ([ADR-0027](decisions/0027-first-run-implementation.md))
- Restore with the kit (browser tests): only the re-wrapped vault is sent; the words and
  new passphrase appear in no request or storage; the old passphrase stops working
- Household gate (browser tests): a wrap from someone else is used only after the member
  confirms that sender's code; **No** installs nothing ([ADR-0030](decisions/0030-household-key-after-unlock.md))
- Household panel (browser tests): the inviter wraps the HDK only after *It matches*, to the
  exact key whose code was shown; *It doesn't match* cancels the invite and wraps nothing ([ADR-0031](decisions/0031-inviter-household-panel.md))
- E2E security specs: *household B cannot read household A*, *DB contains no plaintext*

## Explicitly accepted risks

- Lose passphrase + recovery kit + spouse's copy ⇒ data unrecoverable (disclosed in-app).
- Third-party price feeds are unofficial and may break or be poisoned; every price has a
  manual override and a staleness indicator.
- Auth tables (ADR-0020) hold account data in the clear: email, display name, session IP
  and user agent, passkey public keys. Needed to decide who may sync; none of it is financial.
- Whoever controls a member's mailbox can sign in as them (email code or magic link,
  [ADR-0039](decisions/0039-magic-link-sign-in.md)). Sign-in gates ciphertext only; it never yields a data key. Links carry the
  token in the URL fragment (never in logs), work once, and need a tap on *Continue*.
- Traffic *volume* (roughly how many records exist) is visible to the host. Accepted.

## Reporting

This is a private, single-household project. Security issues go in a GitHub issue labelled
`area:security` — the owner is the only reporter.
