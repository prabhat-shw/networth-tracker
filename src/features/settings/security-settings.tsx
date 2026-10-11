"use client";

import { createContext, useContext, useState } from "react";
import {
  type IdentityVault,
  removePassphraseSlot,
  removeRecoverySlot,
} from "@/crypto/vault";
import type { DeviceSlot } from "@/crypto/vault-device";
import { removePasskeySlot } from "@/crypto/vault-passkey";
import { toBase64url } from "@/crypto/wire";
import { type KeySession, keySession } from "@/features/lock/key-session";
import { isSynced, type PrfApi } from "@/features/lock/passkey-prf";
import { RecoveryChooser } from "@/features/lock/recovery-chooser";
import { primary, Reauth } from "./reauth";

/** What Settings → Security works on; the gate provides it once the key is open (#103). */
export interface SecuritySource {
  email: string;
  vault: IdentityVault;
  /** This device's slot: present exactly when app lock is off (ADR-0043). */
  device: DeviceSlot | null;
  /** Uploads the vault and keeps it as the current one. */
  saveVault(next: IdentityVault): Promise<void>;
  /** App lock off: this slot opens the app on this device from now on. */
  keepDeviceSlot(slot: DeviceSlot): Promise<void>;
  /** App lock on: forgets this device's key. */
  dropDeviceSlot(): Promise<void>;
}

export const SecurityContext = createContext<SecuritySource | null>(null);

interface Method {
  id: string;
  label: string;
  remove(vault: IdentityVault): IdentityVault;
}

function methods(vault: IdentityVault): Method[] {
  const out: Method[] = [];
  if (vault.byPassphrase)
    out.push({
      id: "passphrase",
      label: "Passphrase",
      remove: removePassphraseSlot,
    });
  if (vault.byRecovery)
    out.push({
      id: "recovery",
      label: "Recovery kit",
      remove: removeRecoverySlot,
    });
  vault.passkeys.forEach((slot, i) => {
    out.push({
      id: `passkey-${toBase64url(slot.credentialId)}`,
      label: `Passkey ${i + 1}${isSynced(slot.credentialId) ? " · syncs" : ""}`,
      remove: (v) => removePasskeySlot(v, slot.credentialId),
    });
  });
  return out;
}

const canUnlock = (v: IdentityVault) =>
  !!v.byPassphrase || v.passkeys.length > 0;

/** Why a method can't be removed, or null if it can. */
function keepReason(m: Method, vault: IdentityVault, appLock: boolean) {
  let next: IdentityVault;
  try {
    next = m.remove(vault);
  } catch {
    return "Your only way back in";
  }
  return appLock && !canUnlock(next)
    ? "App lock needs a passkey or passphrase"
    : null;
}

type Step =
  | { at: "idle" }
  | { at: "reauth"; for: "app-lock-off" | "add" }
  | { at: "add"; slot: DeviceSlot }
  | { at: "remove"; method: Method };

/**
 * Settings → Security (UX.md §3.9, ADR-0037, ADR-0043): the ways back in, app lock, and
 * Lock now. Lowering protection (app lock off) and adding a method without this device's
 * slot ask for the passphrase or a passkey first. At least one recovery method stays; with
 * app lock on, a passphrase or passkey stays too, or no session could unlock.
 */
export function SecuritySettings({
  keys = keySession,
  prf,
  addPasskey,
}: {
  keys?: KeySession;
  prf?: PrfApi;
  addPasskey?: () => Promise<boolean>;
}) {
  const source = useContext(SecurityContext);
  const [step, setStep] = useState<Step>({ at: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!source) return null;
  const { vault, device } = source;
  const appLock = device === null;
  const list = methods(vault);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      setStep({ at: "idle" });
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="security-heading"
      className="flex w-full flex-col gap-4 text-sm"
    >
      <h2 id="security-heading" className="text-lg font-semibold">
        Security
      </h2>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Ways back in</h3>
        <ul className="flex flex-col gap-2">
          {list.map((m) => {
            const reason = keepReason(m, vault, appLock);
            return (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800"
              >
                <span>{m.label}</span>
                {reason ? (
                  <span className="text-xs text-neutral-500">{reason}</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Remove ${m.label}`}
                    onClick={() => setStep({ at: "remove", method: m })}
                    className="text-xs underline"
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {list.length === 0 && (
          <p className="text-neutral-500">
            None yet: your key is only on this device.
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            setStep(
              device
                ? { at: "add", slot: device }
                : { at: "reauth", for: "add" },
            )
          }
          className="self-start underline"
        >
          Add a way back in
        </button>
      </div>

      <label className="flex items-start justify-between gap-3">
        <span className="flex flex-col">
          <span className="font-medium">App lock</span>
          <span className="text-xs text-neutral-500">
            {appLock
              ? "Each visit asks for your passkey or passphrase. Locks after 5 minutes idle."
              : "This device opens NetWorth without asking."}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={appLock}
          checked={appLock}
          disabled={busy || (!appLock && !canUnlock(vault))}
          onChange={() =>
            appLock
              ? setStep({ at: "reauth", for: "app-lock-off" })
              : run(() => source.dropDeviceSlot())
          }
          className="mt-1 h-5 w-5"
        />
      </label>
      {!appLock && !canUnlock(vault) && (
        <p className="text-xs text-neutral-500">
          Add a passkey or passphrase to turn on app lock.
        </p>
      )}

      {step.at === "reauth" && (
        <Reauth
          vault={vault}
          prf={prf}
          reason={
            step.for === "app-lock-off"
              ? "Turning app lock off lets this device open NetWorth without asking. Confirm it's you."
              : "Confirm it's you to add a way back in."
          }
          onCancel={() => setStep({ at: "idle" })}
          onSlot={async (slot) => {
            if (step.for === "add") setStep({ at: "add", slot });
            else await run(() => source.keepDeviceSlot(slot));
          }}
        />
      )}
      {step.at === "add" && (
        <RecoveryChooser
          title="Add a way back in"
          source={{
            email: source.email,
            vault,
            device: step.slot,
            saveVault: source.saveVault,
            // Face ID turns app lock on; with it on already, the slot was only borrowed.
            dropDeviceSlot: device ? source.dropDeviceSlot : async () => {},
          }}
          prf={prf}
          addPasskey={addPasskey}
          onProtected={() => setStep({ at: "idle" })}
          onCancel={() => setStep({ at: "idle" })}
        />
      )}
      {step.at === "remove" && (
        <div
          role="dialog"
          aria-label="Remove a way back in"
          className="flex flex-col gap-2 rounded-md border border-neutral-300 p-4 dark:border-neutral-700"
        >
          <p>
            Remove {step.method.label}? It will stop working on every device.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(() => source.saveVault(step.method.remove(vault)))
            }
            className={primary}
          >
            Yes, remove
          </button>
          <button
            type="button"
            onClick={() => setStep({ at: "idle" })}
            className="underline"
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}

      <button type="button" onClick={() => keys.lock()} className={primary}>
        Lock now
      </button>
      {!appLock && (
        <p className="text-xs text-neutral-500">
          With app lock off, this device opens again without asking.
        </p>
      )}
    </section>
  );
}
