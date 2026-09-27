"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  betterAuthSignIn,
  hasPasskeyHint,
  type SignInApi,
  type SignInError,
} from "./auth-client";

const RESEND_AFTER_S = 30;

const MESSAGES: Record<Exclude<SignInError["kind"], "rate-limited">, string> = {
  "wrong-code": "That code isn't right. Check the email and try again.",
  "stale-code": "That code has expired. Send a new one.",
  failed: "Something went wrong. Check your connection and try again.",
};

/** Seconds left on a countdown that ticks once a second; 0 when done. */
function useCountdown(): [number, (s: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft];
}

/**
 * Sign in (UX.md §3.0 A, ADR-0025). Email, then a 6-digit code that submits itself; a
 * passkey button when this browser registered one. Nothing typed here is stored.
 */
export function SignIn({
  api = betterAuthSignIn(),
  onSignedIn,
}: {
  api?: SignInApi;
  onSignedIn: () => void;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useCountdown();
  const [blockedFor, setBlockedFor] = useCountdown();
  const [passkey, setPasskey] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => setPasskey(hasPasskeyHint()), []);
  useEffect(() => {
    if (sent) codeRef.current?.focus();
  }, [sent]);

  const fail = (e: SignInError) => {
    if (e.kind === "rate-limited") {
      setBlockedFor(e.retryAfterS);
      setError(null);
    } else setError(MESSAGES[e.kind]);
  };

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy || blockedFor > 0) return;
    setBusy(true);
    setError(null);
    const res = await api.sendCode(email.trim());
    setBusy(false);
    if (!res.ok) return fail(res.error);
    setSent(true);
    setResendIn(RESEND_AFTER_S);
    if (codeRef.current) codeRef.current.value = "";
  }

  async function verify(code: string) {
    setBusy(true);
    setError(null);
    const res = await api.verifyCode(email.trim(), code);
    setBusy(false);
    if (res.ok) return onSignedIn();
    if (codeRef.current) codeRef.current.value = "";
    fail(res.error);
  }

  async function withPasskey() {
    setBusy(true);
    setError(null);
    const res = await api.signInWithPasskey();
    setBusy(false);
    if (res.ok) return onSignedIn();
    if (res.error.kind === "rate-limited") fail(res.error);
    else setError("Passkey sign-in didn't work. Use your email instead.");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">NetWorth Tracker</h1>

      <div className="flex w-full max-w-xs flex-col gap-3">
        {passkey && (
          <button
            type="button"
            onClick={withPasskey}
            disabled={busy || blockedFor > 0}
            className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            Sign in with passkey
          </button>
        )}

        <form onSubmit={send} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy && !sent}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
          />
          {!sent && (
            <button
              type="submit"
              disabled={busy || blockedFor > 0}
              className="rounded-md border border-neutral-300 px-3 py-2 font-medium disabled:opacity-60 dark:border-neutral-700"
            >
              {busy ? "Sending…" : "Send code"}
            </button>
          )}
        </form>

        {sent && (
          <>
            <p className="text-sm text-neutral-500">
              If this address can use NetWorth, a code is on its way.
            </p>
            <label htmlFor="code" className="text-sm font-medium">
              6-digit code
            </label>
            <input
              id="code"
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              disabled={busy || blockedFor > 0}
              aria-invalid={error !== null}
              aria-describedby={error ? "sign-in-error" : undefined}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                e.target.value = digits;
                if (digits.length === 6) verify(digits);
              }}
              className="rounded-md border border-neutral-300 px-3 py-2 text-center font-mono text-lg tracking-[0.5em] dark:border-neutral-700"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={busy || resendIn > 0 || blockedFor > 0}
              className="text-sm text-neutral-600 underline disabled:no-underline disabled:opacity-60 dark:text-neutral-400"
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
            </button>
          </>
        )}

        {error && (
          <p id="sign-in-error" role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {blockedFor > 0 && (
          <p role="alert" className="text-sm text-red-600">
            Too many tries. Try again in {Math.floor(blockedFor / 60)}:
            {String(blockedFor % 60).padStart(2, "0")}.
          </p>
        )}
      </div>

      <p className="max-w-xs border-t border-neutral-200 pt-4 text-center text-xs text-neutral-500 dark:border-neutral-800">
        Encrypted on this device. We can never see your data.
      </p>
    </main>
  );
}
