"use client";

import {
  type FormEvent,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { IdentityVault } from "@/crypto/vault";
import { installAutoLock, type KeySession, keySession } from "./key-session";
import { type PrfApi, webAuthnPrf } from "./passkey-prf";
import { RestoreWithKit } from "./restore-with-kit";

/** Passkey failures before the passphrase field opens by itself (#75). */
export const PASSKEY_TRIES = 2;

/** Installs auto-lock for as long as the calling component (the app shell) is mounted. */
export function useAutoLock(session: KeySession = keySession) {
  useEffect(() => installAutoLock(session, window), [session]);
}

/**
 * Unlock (UX.md §3.1, ADR-0024). Shows the signed-in email, not the household name: the name
 * is encrypted and unreadable until after this screen. The passphrase is read from the form
 * on submit and the form is reset, so it never sits in React state. "Use recovery kit
 * instead" expands in place (UX.md §3.0 D); a restore hands the re-wrapped vault up through
 * `onVaultChanged`, so the next unlock uses the new passphrase.
 *
 * With a passkey slot in the vault and a PRF-capable browser, "Unlock with Face ID /
 * passkey" is primary and the passphrase expands in place (ADR-0034). After
 * `PASSKEY_TRIES` failures, or if the authenticator gives no PRF output, the passphrase
 * field opens by itself. A browser without PRF only ever sees the passphrase.
 */
export function UnlockScreen({
  email,
  vault,
  session = keySession,
  prf = webAuthnPrf,
  onVaultChanged,
}: {
  email: string;
  vault: IdentityVault;
  session?: KeySession;
  prf?: PrfApi;
  onVaultChanged?: (vault: IdentityVault) => void;
}) {
  const [restoring, setRestoring] = useState(false);
  const hasSlots = vault.passkeys.length > 0;
  const [mode, setMode] = useState<"checking" | "passkey" | "passphrase">(
    hasSlots ? "checking" : "passphrase",
  );
  const [passkeyFails, setPasskeyFails] = useState(0);
  const [tried, setTried] = useState<"passkey" | "passphrase" | null>(null);

  useEffect(() => {
    if (!hasSlots) return setMode("passphrase");
    let live = true;
    prf.available().then(
      (ok) => live && setMode(ok ? "passkey" : "passphrase"),
      () => live && setMode("passphrase"),
    );
    return () => {
      live = false;
    };
  }, [hasSlots, prf]);
  const { status } = useSyncExternalStore(
    session.subscribe,
    session.state,
    session.state,
  );
  const [asking, setAsking] = useState(false);
  const busy = status === "unlocking" || asking;
  const failed = status === "failed" && tried === "passphrase";
  const passkeyFailed = tried === "passkey" && passkeyFails > 0;

  async function unlockWithPasskey() {
    setTried("passkey");
    setAsking(true);
    // undefined: the ceremony failed or was cancelled; null: no PRF output at all.
    const result = await prf.unlock(vault).catch(() => undefined);
    setAsking(false);
    if (result === null) {
      // This authenticator or browser gives no PRF output: passphrase only, no error.
      setTried(null);
      return setMode("passphrase");
    }
    if (result && (await session.unlockWithPasskey(vault, result))) return;
    const fails = passkeyFails + 1;
    setPasskeyFails(fails);
    if (fails >= PASSKEY_TRIES) setMode("passphrase");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const passphrase = new FormData(form).get("passphrase");
    form.reset();
    setTried("passphrase");
    if (typeof passphrase === "string" && passphrase)
      await session.unlock(vault, passphrase);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-8">
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">NetWorth Tracker</h1>
        <p className="text-sm text-neutral-500">{email}</p>
      </header>

      {restoring ? (
        <RestoreWithKit
          vault={vault}
          session={session}
          onRestored={(next) => onVaultChanged?.(next)}
          onCancel={() => setRestoring(false)}
        />
      ) : mode === "checking" ? null : mode === "passkey" ? (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <button
            type="button"
            onClick={unlockWithPasskey}
            disabled={busy}
            className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            {busy ? "Unlocking…" : "Unlock with Face ID / passkey"}
          </button>
          {passkeyFailed && (
            <p role="alert" className="text-sm text-red-600">
              That didn't unlock. Try again, or use your passphrase.
            </p>
          )}
          <button
            type="button"
            onClick={() => setMode("passphrase")}
            disabled={busy}
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            Use passphrase instead
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
          {passkeyFails >= PASSKEY_TRIES && !failed && (
            <output className="block text-sm text-neutral-600 dark:text-neutral-400">
              Your passkey didn't work. Unlock with your passphrase.
            </output>
          )}
          <label htmlFor="passphrase" className="text-sm font-medium">
            Passphrase
          </label>
          <input
            id="passphrase"
            name="passphrase"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
            aria-invalid={failed}
            aria-describedby={failed ? "unlock-error" : undefined}
            className={`rounded-md border px-3 py-2 ${failed ? "border-red-600" : "border-neutral-300 dark:border-neutral-700"}`}
          />
          {failed && (
            <p id="unlock-error" role="alert" className="text-sm text-red-600">
              That passphrase didn't work — try again, or use your recovery kit.
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
                Unlocking…
              </span>
            ) : (
              "Unlock"
            )}
          </button>
          <button
            type="button"
            onClick={() => setRestoring(true)}
            disabled={busy}
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            Use recovery kit instead
          </button>
        </form>
      )}

      <footer className="max-w-xs border-t border-neutral-200 pt-4 text-center text-xs text-neutral-500 dark:border-neutral-800">
        <p>Encrypted on this device. We can never see your data.</p>
        <p className="mt-2">
          There is no password reset that can recover your data. If you forget
          your passphrase, only your recovery kit or another household member
          can let you back in.
        </p>
      </footer>
    </main>
  );
}
