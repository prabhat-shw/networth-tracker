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
| Stolen locked device | Disk read | IndexedDB holds ciphertext only; unlock key derived per session, never persisted |
| Malicious dependency | Exfiltration at runtime | Strict CSP (no third-party origins), lockfile + `osv-scanner` + dependency review, no analytics/CDN |
| Malicious statement file | Parser exploit | PDF/CSV parsed in a Web Worker with no network access; pdf.js sandboxed; fuzz-style parser tests |
| Curious household member | Legitimate login | Per-record ownership; private (non-shared) records are wrapped only to their owner |
| Us (the developers) | Bugs | Plaintext-scan test on the DB, cross-household E2E isolation test, no PII in logs |

## Controls (enforced in CI)

- gitleaks (secrets), CodeQL/semgrep (SAST), `osv-scanner` + dependency review, SBOM
- Doc-size caps, typecheck, Biome, unit tests
- E2E security specs: *household B cannot read household A*, *DB contains no plaintext*

## Explicitly accepted risks

- Lose passphrase + recovery kit + spouse's copy ⇒ data unrecoverable (disclosed in-app).
- Third-party price feeds are unofficial and may break or be poisoned; every price has a
  manual override and a staleness indicator.
- Traffic *volume* (roughly how many records exist) is visible to the host. Accepted.

## Reporting

This is a private, single-household project. Security issues go in a GitHub issue labelled
`area:security` — the owner is the only reporter.
