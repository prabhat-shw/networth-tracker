"use client";

import { useEffect, useRef, useState } from "react";
import { createHousehold as newHouseholdKey } from "@/crypto/household";
import type { IdentityVault, UnlockedIdentity } from "@/crypto/vault";
import {
  createDeviceIdentity,
  type DeviceSlot,
  type DeviceSlotStore,
} from "@/crypto/vault-device";
import { encodeVault, toBase64url } from "@/crypto/wire";
import { type KeySession, keySession } from "@/features/lock/key-session";

/** The server calls first run makes. Only the vault (wrapped keys) and a wrapped HDK go out. */
export interface FirstRunApi {
  putVault(vault: IdentityVault): Promise<void>;
  myHouseholds(): Promise<{ households: { id: string }[]; invited: boolean }>;
  createHousehold(id: string, wrappedHdk: Uint8Array): Promise<void>;
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
};

export interface FirstRunOutcome {
  vault: IdentityVault;
  device: DeviceSlot;
  /** Invited to someone's household: wait to be added (#52) instead of creating one. */
  waitingToJoin: boolean;
}

type Made = Awaited<ReturnType<typeof createDeviceIdentity>>;

/**
 * First run with nothing asked (UX.md §3.0 B, ADR-0037): the key is made on this device and
 * kept in the device slot, the vault (no recovery slot yet) is uploaded, and a household is
 * created unless someone invited this person. The session then starts unlocked. A recovery
 * method is chosen later, at the first invite or data (ADR-0040).
 *
 * Order matters: the device slot is saved before the vault is uploaded, so the server never
 * holds a vault this device can't open. A retry reuses the same identity, because the
 * server refuses a second public key for the account.
 */
export function FirstRun({
  api = httpFirstRunApi,
  keys = keySession,
  store,
  onDone,
}: {
  api?: FirstRunApi;
  keys?: KeySession;
  store: DeviceSlotStore;
  onDone: (outcome: FirstRunOutcome) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const made = useRef<Made>(null);
  const saved = useRef(false);
  const running = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs it on "Try again".
  useEffect(() => {
    if (running.current) return; // React's dev double effect: one run at a time
    running.current = true;
    setFailed(false);
    setUp(api, keys, store, made, saved)
      .then((outcome) => done.current(outcome))
      .catch(() => setFailed(true))
      .finally(() => {
        running.current = false;
      });
  }, [api, keys, store, attempt]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center text-sm">
      {failed ? (
        <>
          <p role="alert">Couldn't finish setting up. Check your connection.</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
          >
            Try again
          </button>
        </>
      ) : (
        <p className="text-neutral-500">Setting up on this device…</p>
      )}
      <p className="max-w-xs text-xs text-neutral-500">
        Encrypted on this device. We can never see your data.
      </p>
    </main>
  );
}

async function setUp(
  api: FirstRunApi,
  keys: KeySession,
  store: DeviceSlotStore,
  made: { current: Made | null },
  saved: { current: boolean },
): Promise<FirstRunOutcome> {
  made.current ??= await createDeviceIdentity();
  const { vault, device, identity } = made.current;
  if (!saved.current) {
    await store.save(device);
    saved.current = true;
  }
  await api.putVault(vault);
  const mine = await api.myHouseholds();
  const waitingToJoin = mine.households.length === 0 && mine.invited;
  const household =
    mine.households.length === 0 && !mine.invited
      ? await newHousehold(api, identity)
      : null;
  keys.start(identity);
  if (household) keys.setHouseholdKey(household);
  made.current = null;
  return { vault, device, waitingToJoin };
}

async function newHousehold(api: FirstRunApi, identity: UnlockedIdentity) {
  const created = await newHouseholdKey(identity);
  await api.createHousehold(created.household.householdId, created.selfWrap);
  return created.household;
}
