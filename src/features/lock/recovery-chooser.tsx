"use client";

import { createContext, type FormEvent, useEffect, useState } from "react";
import type { IdentityVault } from "@/crypto/vault";
import {
  addPasskeyFromDevice,
  addPassphraseFromDevice,
  addRecoveryKitFromDevice,
  type DeviceSlot,
} from "@/crypto/vault-device";
import { authClient, PASSKEY_HINT_KEY } from "@/features/auth/auth-client";
import { RecoveryKit } from "@/features/onboarding/recovery-kit";
import { markFastUnlock, type PrfApi, webAuthnPrf } from "./passkey-prf";

const MIN_PASSPHRASE = 12;

/**
 * What a recovery slot is made from (ADR-0037, ADR-0040): this device's slot, plus how to
 * keep the result. The gate provides it while the device slot is open (#97).
 */
export interface RecoverySource {
  /** Printed on the recovery kit. */
  email: string;
  vault: IdentityVault;
  device: DeviceSlot;
  /** Uploads the vault with its new slot and keeps it as the current one. */
  saveVault(next: IdentityVault): Promise<void>;
  /** App lock on: forgets this device's slot, so each session unlocks again. */
  dropDeviceSlot(): Promise<void>;
}

export const RecoveryContext = createContext<RecoverySource | null>(null);

const registerPasskey = async () =>
  !(await authClient.passkey.addPasskey({ name: "NetWorth" }))?.error;

type Step =
  | { at: "choose" }
  | { at: "passphrase" }
  | { at: "kit"; words: string[]; vault: IdentityVault };

/**
 * "Protect your account first" (UX.md §3.0 E, ADR-0040). Shown when the server refuses the
 * first invite or data write because no recovery method exists. Each choice adds its slot
 * from the device slot alone; Face ID / passkey also turns app lock on. `onProtected` runs
 * once the vault with the new slot is saved, so the caller can retry what was refused.
 */
export function RecoveryChooser({
  source,
  prf = webAuthnPrf,
  addPasskey = registerPasskey,
  onProtected,
  onCancel,
  title = "Protect your account first",
}: {
  source: RecoverySource;
  prf?: PrfApi;
  addPasskey?: () => Promise<boolean>;
  onProtected: () => void;
  onCancel: () => void;
  /** Settings → Security reuses the chooser to add another method (#103). */
  title?: string;
}) {
  const [step, setStep] = useState<Step>({ at: "choose" });
  const [passkeys, setPasskeys] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    prf.available().then((ok) => live && setPasskeys(ok));
    return () => {
      live = false;
    };
  }, [prf]);

  async function run(work: () => Promise<boolean | undefined>, fail: string) {
    setBusy(true);
    setError(null);
    try {
      if (await work()) onProtected();
    } catch {
      setError(fail);
    } finally {
      setBusy(false);
    }
  }

  const withPasskey = () =>
    run(async () => {
      if (!(await addPasskey().catch(() => false)))
        throw new Error("no passkey");
      try {
        localStorage.setItem(PASSKEY_HINT_KEY, "1");
      } catch {
        // Storage off: the passkey works, the sign-in button just isn't offered first.
      }
      const result = await prf.enrol();
      if (!result) {
        setError(
          "This passkey can sign you in but can't unlock your data. Choose a passphrase or recovery kit.",
        );
        return false;
      }
      const { vault, device } = source;
      await source.saveVault(await addPasskeyFromDevice(vault, device, result));
      markFastUnlock("enrolled");
      // App lock on by default with Face ID (ADR-0037): best effort, the vault is safe already.
      await source.dropDeviceSlot().catch(() => {});
      return true;
    }, "That didn't work. Try again, or choose another way.");

  function withPassphrase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const passphrase = new FormData(form).get("passphrase");
    if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE)
      return setError(`Use at least ${MIN_PASSPHRASE} characters.`);
    form.reset();
    run(async () => {
      const { vault, device } = source;
      await source.saveVault(
        await addPassphraseFromDevice(vault, device, passphrase),
      );
      return true;
    }, "Couldn't save. Check your connection and try again.");
  }

  const makeKit = () =>
    run(async () => {
      const made = await addRecoveryKitFromDevice(source.vault, source.device);
      setStep({
        at: "kit",
        words: made.recoveryCode.split(" "),
        vault: made.vault,
      });
      return false;
    }, "Couldn't create a recovery kit on this device. Try again.");

  const kitConfirmed = (vault: IdentityVault) =>
    run(async () => {
      await source.saveVault(vault);
      return true;
    }, "Couldn't save. Check your connection and try again.");

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 text-left text-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {step.at === "choose" && (
        <>
          <p className="text-neutral-600 dark:text-neutral-400">
            Your key is only on this device. Before anyone else joins, choose a
            way back in if this device is lost. We can't reset it for you.
          </p>
          {passkeys && (
            <button
              type="button"
              onClick={withPasskey}
              disabled={busy}
              className={primary}
            >
              Use Face ID / passkey
            </button>
          )}
          {passkeys && (
            <p className="text-xs text-neutral-500">
              Recommended. Also turns on app lock: you unlock with Face ID each
              time.
            </p>
          )}
          <button
            type="button"
            onClick={() => setStep({ at: "passphrase" })}
            disabled={busy}
            className={secondary}
          >
            Choose a passphrase
          </button>
          <button
            type="button"
            onClick={makeKit}
            disabled={busy}
            className={secondary}
          >
            Save a recovery kit
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-neutral-600 underline dark:text-neutral-400"
          >
            Not now
          </button>
        </>
      )}

      {step.at === "passphrase" && (
        <form onSubmit={withPassphrase} className="flex flex-col gap-2">
          <label htmlFor="recovery-passphrase" className="font-medium">
            Passphrase
          </label>
          <input
            id="recovery-passphrase"
            name="passphrase"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSPHRASE}
            required
            disabled={busy}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
          />
          <p className="text-neutral-500">
            Four or more unrelated words is strong and easy to type. We can't
            reset it.
          </p>
          <button type="submit" disabled={busy} className={primary}>
            {busy ? "Saving…" : "Save passphrase"}
          </button>
          <button
            type="button"
            onClick={() => setStep({ at: "choose" })}
            disabled={busy}
            className="text-neutral-600 underline dark:text-neutral-400"
          >
            Back
          </button>
        </form>
      )}

      {step.at === "kit" && (
        <RecoveryKit
          words={step.words}
          email={source.email}
          busy={busy}
          onConfirmed={() => kitConfirmed(step.vault)}
        />
      )}

      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}

const primary =
  "rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900";
const secondary =
  "rounded-md border border-neutral-300 px-3 py-2 font-medium disabled:opacity-60 dark:border-neutral-700";
