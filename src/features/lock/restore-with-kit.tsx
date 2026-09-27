"use client";

import { wordlist } from "@scure/bip39/wordlists/english.js";
import { type FormEvent, useRef, useState } from "react";
import { DecryptError } from "@/crypto/aead";
import {
  deriveRecoveryKey,
  normaliseRecoveryCode,
  RecoveryCodeError,
} from "@/crypto/recovery";
import { type IdentityVault, restoreWithRecoveryCode } from "@/crypto/vault";
import { httpFirstRunApi } from "@/features/onboarding/first-run";
import type { KeySession } from "./key-session";

const MIN_PASSPHRASE = 12;
const KNOWN = new Set(wordlist);

/**
 * What is wrong with a typed kit, in words the person can act on. Safe to say (ADR-0018):
 * it is about the typing, not the vault. `null` = the words and checksum are valid.
 */
export async function kitProblem(typed: string): Promise<string | null> {
  const words = normaliseRecoveryCode(typed).split(" ").filter(Boolean);
  if (words.length !== 24)
    return `Your kit has 24 words; this has ${words.length}.`;
  const bad = words.findIndex((w) => !KNOWN.has(w));
  if (bad >= 0) return `Word ${bad + 1} isn't in the recovery list.`;
  try {
    await deriveRecoveryKey(typed);
    return null;
  } catch (e) {
    if (e instanceof RecoveryCodeError)
      return "One of the words is wrong. Check them against your kit.";
    throw e;
  }
}

/**
 * Forgotten passphrase (UX.md §3.0 D, #54): the recovery kit unwraps the private key, a new
 * passphrase re-wraps it, and the new vault is uploaded. The words and passphrase are read
 * from the form and cleared; only the re-wrapped vault leaves the device.
 */
export function RestoreWithKit({
  vault,
  session,
  putVault = httpFirstRunApi.putVault,
  onRestored,
  onCancel,
}: {
  vault: IdentityVault;
  session: KeySession;
  putVault?: (vault: IdentityVault) => Promise<void>;
  onRestored: (vault: IdentityVault) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"words" | "passphrase">("words");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kit = useRef<string | null>(null);
  const pending =
    useRef<Awaited<ReturnType<typeof restoreWithRecoveryCode>>>(null);

  async function checkWords(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = String(new FormData(event.currentTarget).get("kit") ?? "");
    setBusy(true);
    const problem = await kitProblem(typed);
    setBusy(false);
    if (problem) return setError(problem);
    kit.current = typed;
    setError(null);
    setStep("passphrase");
  }

  async function save(restored: NonNullable<typeof pending.current>) {
    try {
      await putVault(restored.vault);
    } catch {
      pending.current = restored;
      return setError(
        "Couldn't save your new passphrase. Check your connection and try again.",
      );
    }
    pending.current = null;
    session.start(restored.identity);
    onRestored(restored.vault);
  }

  async function choosePassphrase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (pending.current) {
      setBusy(true);
      await save(pending.current);
      return setBusy(false);
    }
    const form = event.currentTarget;
    const passphrase = String(new FormData(form).get("passphrase") ?? "");
    if (passphrase.length < MIN_PASSPHRASE)
      return setError(`Use at least ${MIN_PASSPHRASE} characters.`);
    if (!kit.current) return setStep("words");
    form.reset();
    setBusy(true);
    try {
      const restored = await restoreWithRecoveryCode(
        vault,
        kit.current,
        passphrase,
      );
      kit.current = null;
      await save(restored);
    } catch (e) {
      if (!(e instanceof DecryptError)) throw e;
      kit.current = null;
      setStep("words");
      setError("This kit doesn't match your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      {step === "words" ? (
        <form onSubmit={checkWords} className="flex flex-col gap-3">
          <label htmlFor="kit" className="text-sm font-medium">
            Recovery kit words
          </label>
          <textarea
            id="kit"
            name="kit"
            rows={5}
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
            aria-invalid={error !== null}
            className="rounded-md border border-neutral-300 px-3 py-2 font-mono dark:border-neutral-700"
          />
          <p className="text-sm text-neutral-500">
            All 24 words, in order. Paste is fine.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            Restore
          </button>
        </form>
      ) : (
        <form onSubmit={choosePassphrase} className="flex flex-col gap-3">
          <label htmlFor="restore-passphrase" className="text-sm font-medium">
            New passphrase
          </label>
          <input
            id="restore-passphrase"
            name="passphrase"
            type="password"
            autoComplete="new-password"
            minLength={pending.current ? undefined : MIN_PASSPHRASE}
            required={!pending.current}
            disabled={busy}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
          />
          <p className="text-sm text-neutral-500">
            Your recovery kit still works afterwards. If you think someone else
            has seen it, make a new one in Settings.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            {busy ? "Restoring…" : "Save and unlock"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="text-sm text-neutral-600 underline dark:text-neutral-400"
      >
        Use passphrase instead
      </button>
    </div>
  );
}
