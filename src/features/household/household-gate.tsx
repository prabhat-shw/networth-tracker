"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { type HouseholdKey, keyFingerprint } from "@/crypto/household";
import { exportPublicKey } from "@/crypto/keys";
import type { KeySession } from "@/features/lock/key-session";
import {
  type HouseholdApi,
  httpHouseholdApi,
  resolveHousehold,
  trustStore,
} from "./household-client";

const POLL_MS = 5_000;
const STILL_WAITING_MS = 10 * 60_000;

/** What renders. Keys never enter React state (ADR-0024): a pending one waits in a ref. */
type Phase =
  | { at: "loading" | "error" | "stopped" | "ready" | "none" }
  | { at: "waiting"; invitedBy: string }
  | { at: "confirm"; senderFingerprint: string };

/**
 * Stands between unlock and the app (#63, ADR-0030): loads this member's household key,
 * or shows why it can't yet. Mounted only while unlocked, so it runs again after every
 * unlock. Nothing reaches the app until the key is in the session.
 */
export function HouseholdGate({
  keys,
  api = httpHouseholdApi,
  children,
}: {
  keys: KeySession;
  api?: HouseholdApi;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>(() => ({
    at: keys.householdKey() ? "ready" : "loading",
  }));
  const [ownCode, setOwnCode] = useState<string | null>(null);
  const [since] = useState(() => Date.now());
  const pending = useRef<{ household: HouseholdKey; fingerprint: string }>(
    null,
  );

  useEffect(() => {
    if (keys.householdKey()) return;
    const identity = keys.identity();
    if (!identity) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    exportPublicKey(identity.publicKey)
      .then(keyFingerprint)
      .then((code) => live && setOwnCode(code));

    const run = async () => {
      let next: Phase;
      try {
        const resolved = await resolveHousehold(identity, api);
        if (!live) return;
        if (resolved.kind === "ready") {
          keys.setHouseholdKey(resolved.household);
          next = { at: "ready" };
        } else if (resolved.kind === "confirm") {
          pending.current = {
            household: resolved.household,
            fingerprint: resolved.senderFingerprint,
          };
          next = {
            at: "confirm",
            senderFingerprint: resolved.senderFingerprint,
          };
        } else if (resolved.kind === "waiting") {
          next = { at: "waiting", invitedBy: resolved.invitedBy };
          timer = setTimeout(run, POLL_MS);
        } else next = { at: "none" };
      } catch {
        next = { at: "error" };
      }
      if (live) setPhase(next);
    };
    run();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [keys, api]);

  function confirm() {
    const confirmed = pending.current;
    pending.current = null;
    if (!confirmed) return;
    trustStore.set(confirmed.household.householdId, confirmed.fingerprint);
    keys.setHouseholdKey(confirmed.household);
    setPhase({ at: "ready" });
  }

  function reject() {
    pending.current = null; // the unwrapped key is dropped, never used
    setPhase({ at: "stopped" });
  }

  switch (phase.at) {
    case "ready":
      return children;
    case "loading":
      return <Screen>Opening your household…</Screen>;
    case "error":
      return (
        <Screen>
          Couldn't open your household. Check your connection, then lock and
          unlock to try again.
        </Screen>
      );
    case "none":
      return (
        <Screen>
          You're not in a household yet. Ask a household member to invite you.
        </Screen>
      );
    case "stopped":
      return (
        <Screen>
          <p role="alert" className="max-w-xs font-medium text-red-600">
            Stop. Someone may be intercepting this invite. Don't retry; tell the
            person who runs your server.
          </p>
          <p className="max-w-xs">
            Nothing from this household was opened on this device.
          </p>
        </Screen>
      );
    case "waiting":
      return (
        <Screen>
          <Heading>Waiting to join</Heading>
          <p>
            {phase.invitedBy} needs to add you. Call them and read out your
            code:
          </p>
          <Code value={ownCode} label="Your code" />
          {Date.now() - since >= STILL_WAITING_MS && (
            <p>Still waiting. {phase.invitedBy} can add you from Household.</p>
          )}
        </Screen>
      );
    case "confirm":
      return (
        <Screen>
          <Heading>Check who added you</Heading>
          <Code value={phase.senderFingerprint} label="Their code" />
          <p>Does it match what they read to you, exactly?</p>
          <div className="flex w-full max-w-xs flex-col gap-3">
            <button
              type="button"
              onClick={confirm}
              className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              Yes — open household
            </button>
            <button
              type="button"
              onClick={reject}
              className="rounded-md border border-neutral-300 px-3 py-2 font-medium dark:border-neutral-700"
            >
              No
            </button>
          </div>
        </Screen>
      );
  }
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center text-sm text-neutral-600 dark:text-neutral-400">
      {children}
    </main>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
      {children}
    </h2>
  );
}

function Code({ value, label }: { value: string | null; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="font-mono text-2xl tracking-wider text-neutral-900 dark:text-neutral-100">
        {value ?? "…"}
      </p>
    </div>
  );
}
