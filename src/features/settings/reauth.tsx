"use client";

import { type FormEvent, useState } from "react";
import type { IdentityVault } from "@/crypto/vault";
import {
  type DeviceSlot,
  deviceSlotByPasskey,
  deviceSlotByPassphrase,
} from "@/crypto/vault-device";
import { type PrfApi, webAuthnPrf } from "@/features/lock/passkey-prf";

export const primary =
  "rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900";

/**
 * Confirms it's you before lowering protection or adding a method (ADR-0043). The session
 * key can't be re-wrapped, so the passphrase or a passkey builds a fresh device slot; the
 * caller keeps it (app lock off) or uses it once and drops it (adding a method).
 */
export function Reauth({
  vault,
  prf = webAuthnPrf,
  reason,
  onSlot,
  onCancel,
}: {
  vault: IdentityVault;
  prf?: PrfApi;
  reason: string;
  onSlot: (slot: DeviceSlot) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(make: () => Promise<DeviceSlot | null>, fail: string) {
    setBusy(true);
    setError(null);
    try {
      const slot = await make();
      if (slot) await onSlot(slot);
      else setError(fail);
    } catch {
      setError(fail);
    } finally {
      setBusy(false);
    }
  }

  function withPassphrase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const passphrase = new FormData(form).get("passphrase");
    if (typeof passphrase !== "string" || !passphrase) return;
    form.reset();
    run(
      () => deviceSlotByPassphrase(vault, passphrase),
      "That passphrase didn't work.",
    );
  }

  const withPasskey = () =>
    run(async () => {
      const result = await prf.unlock(vault);
      return result ? deviceSlotByPasskey(vault, result) : null;
    }, "That passkey didn't work.");

  return (
    <section
      role="dialog"
      aria-label="Confirm it's you"
      className="flex flex-col gap-3 rounded-md border border-neutral-300 p-4 dark:border-neutral-700"
    >
      <p>{reason}</p>
      {vault.passkeys.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={withPasskey}
          className={primary}
        >
          Use passkey
        </button>
      )}
      {vault.byPassphrase && (
        <form onSubmit={withPassphrase} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span>Passphrase</span>
            <input
              name="passphrase"
              type="password"
              autoComplete="current-password"
              className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <button type="submit" disabled={busy} className={primary}>
            Confirm
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <button type="button" onClick={onCancel} className="underline">
        Cancel
      </button>
    </section>
  );
}
