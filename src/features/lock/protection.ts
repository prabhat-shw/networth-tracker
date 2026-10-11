/**
 * The protection banner's rules (ADR-0037, ADR-0042): one line of risk for each gap, and
 * none once all hold — a recovery method, a second method or a synced passkey, and app
 * lock on. Pure: the gate passes in what it knows.
 */
import type { VaultSlots } from "@/crypto/wire";

export type Risk = "no-recovery" | "single-method" | "app-lock-off";

export interface Protection {
  slots: VaultSlots;
  /** Some passkey of this vault reported the WebAuthn backup-state flag on this device. */
  syncedPasskey: boolean;
  /** No device slot is kept here: every session needs a passkey or the passphrase. */
  appLock: boolean;
}

export const RISK_COPY: Record<Risk, string> = {
  "no-recovery":
    "Your key is only on this device. If you lose it, your data is gone. Add a passkey, passphrase or recovery kit.",
  "single-method":
    "You have one way back in. Add a second one, or use a passkey that syncs (iCloud Keychain, Google Password Manager).",
  "app-lock-off":
    "Anyone who can use this browser can open NetWorth. Turn on app lock.",
};

export function risks({ slots, syncedPasskey, appLock }: Protection): Risk[] {
  const methods =
    Number(slots.passphrase) + Number(slots.recovery) + slots.passkeys;
  const out: Risk[] = [];
  // With no method at all, "add a second one" would read wrong: ask for the first.
  if (methods === 0) out.push("no-recovery");
  else if (methods < 2 && !syncedPasskey) out.push("single-method");
  if (!appLock) out.push("app-lock-off");
  return out;
}
