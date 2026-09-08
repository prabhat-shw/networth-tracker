# ADR-0002 — Key hierarchy, sharing and recovery

**Status:** Accepted · 2026-09-08

## Context

Zero-knowledge (ADR-0001) requires keys that exist only on devices, yet the data must be
shared with a spouse and survive a lost phone.

## Decision

```
passphrase --Argon2id(m=64MB,t=3,p=1)--> unlockKey ─┐
recovery code (24 words, offline)  ----------------┤-> unwraps userPrivateKey (ECDH P-256)
passkey PRF (optional, fast unlock) ---------------┘
                     householdDataKey (HDK, AES-256-GCM, random 256-bit)
                     wrapped per member: ECDH(P-256) -> HKDF -> AES-KW
                     records: AES-256-GCM(HDK, iv=random 96-bit, aad=recordId|version)
```

- **Sharing** = wrapping the HDK to the invitee's public key. The server relays the wrapped
  blob only.
- **Recovery** = (a) the printed recovery kit, or (b) social recovery — the spouse re-wraps
  the HDK to a newly created identity key after the owner re-registers.
- ECDH **P-256** (not X25519) because WebCrypto support is universal today; revisit when
  X25519 lands everywhere.
- Argon2id via `hash-wasm`; parameters are stored with the wrapped key so they can be raised
  later without breaking old vaults.

## Consequences

- Key rotation requires re-encrypting records; the envelope carries a key id to make a
  future rotation possible without a flag day.
- Passkey PRF is a convenience path only; the passphrase remains the root of trust because
  PRF support varies by platform and authenticator.
