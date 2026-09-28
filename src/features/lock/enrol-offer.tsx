"use client";

import { useEffect, useRef, useState } from "react";
import type { IdentityVault } from "@/crypto/vault";
import { PASSKEY_BOUNDS } from "@/crypto/wire";
import { httpFirstRunApi } from "@/features/onboarding/first-run";
import type { KeySession } from "./key-session";
import {
  fastUnlockOffered,
  markFastUnlock,
  type PrfApi,
  webAuthnPrf,
} from "./passkey-prf";

/**
 * One-time offer right after a passphrase unlock (ADR-0034): "Unlock with Face ID /
 * passkey next time?". Shown once per device, only while the session can still enrol, the
 * vault has room and the browser may support PRF; otherwise it closes without rendering.
 * A passkey that gives no PRF output closes it quietly. Only the re-wrapped vault is sent.
 */
export function EnrolOffer({
  vault,
  keys,
  prf = webAuthnPrf,
  putVault = httpFirstRunApi.putVault,
  onEnrolled,
  onClose,
}: {
  vault: IdentityVault;
  keys: KeySession;
  prf?: PrfApi;
  putVault?: (vault: IdentityVault) => Promise<void>;
  onEnrolled: (vault: IdentityVault) => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An enrolled vault whose upload failed: retry the upload, not the passkey.
  const pending = useRef<IdentityVault>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: decided once, on mount.
  useEffect(() => {
    let live = true;
    const eligible =
      !fastUnlockOffered() &&
      keys.canEnrolPasskey() &&
      vault.passkeys.length < PASSKEY_BOUNDS.maxSlots;
    (eligible ? prf.available() : Promise.resolve(false)).then(
      (ok) => live && (ok ? setShown(true) : onClose()),
      () => live && onClose(),
    );
    return () => {
      live = false;
    };
  }, []);

  function notNow() {
    markFastUnlock("declined");
    keys.dismissEnrol();
    onClose();
  }

  async function setUp() {
    setBusy(true);
    setError(null);
    try {
      let next = pending.current;
      if (!next) {
        const result = await prf.enrol().catch(() => undefined);
        if (result === null) return notNow(); // no PRF on this passkey: stay quiet
        if (!result) {
          setError("That didn't work. Try again, or choose Not now.");
          return;
        }
        next = await keys.enrolPasskey(result);
        pending.current = next;
      }
      await putVault(next);
      markFastUnlock("enrolled");
      onEnrolled(next);
      onClose();
    } catch {
      setError(
        pending.current
          ? "Couldn't save. Check your connection and try again."
          : "That didn't work. Try again, or choose Not now.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!shown) return null;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
      <section className="flex w-full max-w-xs flex-col gap-3">
        <h2 className="text-lg font-semibold">Unlock faster next time</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Use Face ID, your fingerprint or a passkey to unlock on this device.
          Your passphrase keeps working.
        </p>
        <button
          type="button"
          onClick={setUp}
          disabled={busy}
          className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Setting up…" : "Use a passkey"}
        </button>
        <button
          type="button"
          onClick={notNow}
          disabled={busy}
          className="rounded-md border border-neutral-300 px-3 py-2 font-medium dark:border-neutral-700"
        >
          Not now
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </section>
      <p className="max-w-xs text-center text-xs text-neutral-500">
        Encrypted on this device. We can never see your data.
      </p>
    </main>
  );
}
