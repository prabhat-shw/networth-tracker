"use client";

import { type FormEvent, useRef, useState } from "react";
import { createHousehold as newHouseholdKey } from "@/crypto/household";
import {
  createIdentity,
  type IdentityVault,
  type UnlockedIdentity,
} from "@/crypto/vault";
import { encodeVault, toBase64url } from "@/crypto/wire";
import { authClient, PASSKEY_HINT_KEY } from "@/features/auth/auth-client";
import { type KeySession, keySession } from "@/features/lock/key-session";
import {
  markFastUnlock,
  type PrfApi,
  webAuthnPrf,
} from "@/features/lock/passkey-prf";
import { RecoveryKit } from "./recovery-kit";

const MIN_PASSPHRASE = 12;

/** The server calls first run makes. Only the vault (wrapped keys) and a wrapped HDK go out. */
export interface FirstRunApi {
  putVault(vault: IdentityVault): Promise<void>;
  myHouseholds(): Promise<{ households: { id: string }[]; invited: boolean }>;
  createHousehold(id: string, wrappedHdk: Uint8Array): Promise<void>;
  addPasskey(): Promise<boolean>;
}

async function expectOk(res: Response, what: string) {
  if (!res.ok) throw new Error(`${what}: ${res.status}`);
  return res;
}

const json = { "content-type": "application/json" };

export const httpFirstRunApi: FirstRunApi = {
  async putVault(vault) {
    await expectOk(
      await fetch("/api/identity/vault", {
        method: "PUT",
        headers: json,
        body: JSON.stringify(encodeVault(vault)),
      }),
      "vault",
    );
  },
  async myHouseholds() {
    const res = await fetch("/api/households", { cache: "no-store" });
    return (await expectOk(res, "households")).json();
  },
  async createHousehold(id, wrappedHdk) {
    await expectOk(
      await fetch("/api/households", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ id, wrappedHdk: toBase64url(wrappedHdk) }),
      }),
      "household",
    );
  },
  async addPasskey() {
    const res = await authClient.passkey.addPasskey({ name: "NetWorth" });
    return !res?.error;
  },
};

export interface FirstRunOutcome {
  vault: IdentityVault;
  /** Invited to someone's household: wait to be added (#52) instead of creating one. */
  waitingToJoin: boolean;
}

const passkeysSupported = () => typeof PublicKeyCredential !== "undefined";

/**
 * First run (UX.md §3.0 B, ADR-0025): choose a passphrase → save the recovery kit → optional
 * sign-in passkey. Keys are made on this device. Nothing reaches the server until the kit is
 * confirmed; then the vault is uploaded and, if nobody has invited this person, a household
 * is created silently. The session then starts unlocked with the new identity. A step-3
 * passkey with PRF also becomes a fast-unlock slot (ADR-0034); `enrol` is dropped at `finish`.
 */
export function FirstRun({
  email,
  api = httpFirstRunApi,
  keys = keySession,
  prf = webAuthnPrf,
  onDone,
}: {
  email: string;
  api?: FirstRunApi;
  keys?: KeySession;
  prf?: PrfApi;
  onDone: (outcome: FirstRunOutcome) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [words, setWords] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const made = useRef<{ vault: IdentityVault; identity: UnlockedIdentity }>(
    null,
  );
  const outcome = useRef<FirstRunOutcome>(null);
  const enrol =
    useRef<Awaited<ReturnType<typeof createIdentity>>["enrolPasskey"]>(null);

  async function choosePassphrase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const passphrase = new FormData(form).get("passphrase");
    if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE)
      return setError(`Use at least ${MIN_PASSPHRASE} characters.`);
    form.reset();
    setError(null);
    setBusy(true);
    try {
      const { vault, identity, recoveryCode, enrolPasskey } =
        await createIdentity(passphrase);
      made.current = { vault, identity };
      enrol.current = enrolPasskey;
      setWords(recoveryCode.split(" "));
      setStep(2);
    } catch {
      setError("Couldn't create your keys on this device. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function kitConfirmed() {
    const current = made.current;
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await api.putVault(current.vault);
      const mine = await api.myHouseholds();
      const waitingToJoin = mine.households.length === 0 && mine.invited;
      let household = null;
      if (mine.households.length === 0 && !mine.invited) {
        const created = await newHouseholdKey(current.identity);
        await api.createHousehold(
          created.household.householdId,
          created.selfWrap,
        );
        household = created.household;
      }
      keys.start(current.identity);
      if (household) keys.setHouseholdKey(household);
      made.current = null;
      setWords(null);
      outcome.current = { vault: current.vault, waitingToJoin };
      if (passkeysSupported()) setStep(3);
      else onDone(outcome.current);
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addPasskey() {
    setBusy(true);
    setError(null);
    const ok = await api.addPasskey().catch(() => false);
    setBusy(false);
    if (!ok)
      return setError(
        "That didn't work. You can add a passkey later in Settings.",
      );
    try {
      localStorage.setItem(PASSKEY_HINT_KEY, "1");
    } catch {
      // Storage off: the passkey still works, the button just isn't offered first.
    }
    await enrolFastUnlock();
    finish();
  }

  /** Best effort: any failure leaves passphrase unlock, and the offer after a later unlock. */
  async function enrolFastUnlock() {
    const current = outcome.current;
    const add = enrol.current;
    if (!current || !add) return;
    setBusy(true);
    try {
      const result = await prf.enrol();
      if (!result) return;
      const vault = await add(current.vault, result);
      await api.putVault(vault);
      outcome.current = { ...current, vault };
      markFastUnlock("enrolled");
    } catch {
      // The offer after the next passphrase unlock covers it.
    } finally {
      setBusy(false);
    }
  }

  const finish = () => {
    enrol.current = null;
    if (outcome.current) onDone(outcome.current);
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
      <p className="text-sm text-neutral-500 print:hidden">Step {step} of 3</p>

      {step === 1 && (
        <form
          onSubmit={choosePassphrase}
          className="flex w-full max-w-xs flex-col gap-3"
        >
          <h2 className="text-lg font-semibold">Choose a passphrase</h2>
          <label htmlFor="new-passphrase" className="text-sm font-medium">
            Passphrase
          </label>
          <div className="flex gap-2">
            <input
              id="new-passphrase"
              name="passphrase"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              minLength={MIN_PASSPHRASE}
              required
              disabled={busy}
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="text-sm text-neutral-600 underline dark:text-neutral-400"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-sm text-neutral-500">
            Four or more unrelated words is strong and easy to type.
          </p>
          <p className="text-sm text-neutral-500">
            We can't reset this. Forget it, and only your recovery kit or a
            household member gets you back in.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            {busy ? "Creating your keys…" : "Continue"}
          </button>
        </form>
      )}

      {step === 2 && words && (
        <RecoveryKit
          words={words}
          email={email}
          busy={busy}
          onConfirmed={kitConfirmed}
        />
      )}

      {step === 3 && (
        <section className="flex w-full max-w-xs flex-col gap-3">
          <h2 className="text-lg font-semibold">Faster sign-in</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Add a passkey to sign in and unlock with Face ID or your
            fingerprint. Your passphrase keeps working.
          </p>
          <button
            type="button"
            onClick={addPasskey}
            disabled={busy}
            className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            Add passkey
          </button>
          <button
            type="button"
            onClick={finish}
            disabled={busy}
            className="rounded-md border border-neutral-300 px-3 py-2 font-medium dark:border-neutral-700"
          >
            Not now
          </button>
        </section>
      )}

      {error && (
        <p role="alert" className="max-w-xs text-sm text-red-600">
          {error}
        </p>
      )}
      <p className="max-w-xs text-center text-xs text-neutral-500 print:hidden">
        Encrypted on this device. We can never see your data.
      </p>
    </main>
  );
}
