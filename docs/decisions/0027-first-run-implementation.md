# ADR-0027 — First run: hand-written kit PDF, session start, invite routing

**Status:** Accepted · 2026-09-27 · issue #53 · implements [ADR-0025](0025-onboarding-flow.md) (UX.md §3.0 B)

## Context

First run creates a member's keys, shows the recovery code once and puts the first
ciphertext on the server. ADR-0025 fixed the flow; this records how it is built.

## Decision

- **Kit PDF is written by hand** (`recovery-kit-pdf.ts`, owner choice): PDF 1.4, one A4
  page, Helvetica + Courier (standard fonts, nothing embedded), ~90 lines, no dependency.
  Non-ASCII becomes `?`. The words never pass through third-party code, and the file is
  made from a `Blob` on the device.
- **Order of effects:** `createIdentity` on Continue (nothing sent) → kit shown → two
  words typed → `PUT /api/identity/vault` → `GET /api/households` (#56) → only if the
  person has no household and no open invite: `createHousehold` on the device and
  `POST /api/households` with the self-wrap. Any failure keeps the kit on screen with a
  retry; re-uploading the same vault is idempotent (same public key).
- **The session adopts the new identity** (`KeySession.start`) instead of asking for the
  passphrase again a few seconds after it was chosen. Auto-lock applies from then on.
- **Invited → waiting.** The gate shows a holding message until #52 builds the join flow.
- **Passkey step** is shown only where WebAuthn exists. On success the non-secret
  `nwt.passkey` hint (ADR-0026) is set.
- **The recovery code lives in React state only while step 2 is on screen**, and is
  dropped once the vault is saved. The passphrase is read from the form and never kept in
  state.
- **Test projects run one after the other** (`sequence.groupOrder`): Argon2id in Chrome
  and Node at once made CPU-bound unit tests time out.

## Consequences

- A lost `POST /api/households` response followed by a retry can leave an empty orphan
  household with one member row. Harmless and rare; cleanup is left for M8.
- The kit PDF is plain; a nicer layout would need a font or a library.
