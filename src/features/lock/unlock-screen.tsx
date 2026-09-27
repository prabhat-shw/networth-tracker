"use client";

import { type FormEvent, useEffect, useSyncExternalStore } from "react";
import type { IdentityVault } from "@/crypto/vault";
import { installAutoLock, type KeySession, keySession } from "./key-session";

/** Installs auto-lock for as long as the calling component (the app shell) is mounted. */
export function useAutoLock(session: KeySession = keySession) {
  useEffect(() => installAutoLock(session, window), [session]);
}

/**
 * Unlock (UX.md §3.1, ADR-0024). Shows the signed-in email, not the household name: the name
 * is encrypted and unreadable until after this screen. The passphrase is read from the form
 * on submit and the form is reset, so it never sits in React state.
 */
export function UnlockScreen({
  email,
  vault,
  session = keySession,
}: {
  email: string;
  vault: IdentityVault;
  session?: KeySession;
}) {
  const { status } = useSyncExternalStore(
    session.subscribe,
    session.state,
    session.state,
  );
  const busy = status === "unlocking";
  const failed = status === "failed";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const passphrase = new FormData(form).get("passphrase");
    form.reset();
    if (typeof passphrase === "string" && passphrase)
      await session.unlock(vault, passphrase);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-8">
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">NetWorth Tracker</h1>
        <p className="text-sm text-neutral-500">{email}</p>
      </header>

      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
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
      </form>

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
