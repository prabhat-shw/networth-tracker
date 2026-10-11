# ADR-0040 — A recovery method before the first invite or data write

**Status:** Accepted · 2026-10-11 · issue #90 · implements part of [ADR-0037](0037-onboarding-v2-key-on-device.md) · builds on [ADR-0038](0038-vault-v3-device-slot.md)

## Context

With onboarding v2 the identity starts with only a device slot (ADR-0038). If that device
is lost before a recovery slot exists, the key is gone. Nothing is lost while the household
is empty, but it would be once there is data or a second member. ADR-0037 says: no data ever
exists that only one device could open.

## Decision

- **The server enforces it.** `requireRecoveryMethod(db, userId)` (`src/server/vault.ts`)
  reads slot *presence* from the stored vault (`storedVaultSlots`, never contents) and
  answers `409 { "error": "recovery-required" }` unless the vault has a passphrase,
  recovery-kit or passkey slot. No vault counts as none. `POST …/invites` calls it after the
  membership guard and body check, before anything is written. The M2 record push must call
  it too (noted in STATE); there is no push route yet.
- **The client reacts to the refusal; it doesn't predict it.** `httpPanelApi.invite` turns that
  409 into `RecoveryRequiredError`. The Household panel then shows the **chooser** in place,
  and once a slot is saved it retries the same invite. Keeping the rule on the server means
  one source of truth; the client never has to agree with it in advance.
- **Chooser** (`src/features/lock/recovery-chooser.tsx`, UX.md §3.0 E): **Use Face ID /
  passkey** (only when the browser may do PRF), **Choose a passphrase** (≥ 12 chars),
  **Save a recovery kit** (24 words; uploaded only after the two-word check), **Not now**.
  Each choice builds its slot from the device slot alone (`add*FromDevice`), with no other
  secret.
- **Face ID turns app lock on.** After the passkey slot is uploaded, the device slot is
  dropped (`dropDeviceSlot`), so each later session unlocks with the passkey or another
  method, with the 5-min auto-lock (the M1 model). The upload comes first, so a failed drop
  leaves app lock off, never a locked-out user. A passkey that gives no PRF output can still
  sign in but saves nothing; the user is pointed to the other two choices.
- **Where the chooser gets its inputs:** a `RecoveryContext` with `{ email, vault, device,
  saveVault, dropDeviceSlot }`. The gate provides it once device slots exist (#97); until then
  no context exists, and every vault already has both slots, so the refusal never fires. If
  it does fire without a context, the panel explains instead of offering a chooser.

## Consequences

- Old (v1/v2) vaults always pass, so nothing changes for existing users or the M1 E2E suite.
- `CodeCheck` moved to `code-check.tsx` to keep the panel under 300 lines.
- #97 must provide `RecoveryContext` from the gate; #92's E2E exercises the refusal for real.

## Alternatives rejected

- **Check on the client before inviting:** a second copy of the rule, and a modified client
  could skip it. The server check is what matters; the chooser is just the way through it.
- **Ask at first run:** that's what ADR-0037 removed. The moment that matters is the first
  invite or data, not sign-in.
