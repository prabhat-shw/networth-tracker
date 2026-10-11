"use client";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { IdentityVault } from "@/crypto/vault";
import {
  type DeviceSlot,
  type DeviceSlotStore,
  openDeviceSlot,
} from "@/crypto/vault-device";
import {
  decodeVault,
  hasRecoveryMethod,
  sameBytes,
  vaultSlots,
} from "@/crypto/wire";
import type { SignInApi } from "@/features/auth/auth-client";
import type { HouseholdApi } from "@/features/household/household-client";
import { HouseholdGate } from "@/features/household/household-gate";
import { deviceSlotStore } from "@/features/lock/device-store";
import { EnrolOffer } from "@/features/lock/enrol-offer";
import { type KeySession, keySession } from "@/features/lock/key-session";
import type { PrfApi } from "@/features/lock/passkey-prf";
import {
  RecoveryContext,
  type RecoverySource,
} from "@/features/lock/recovery-chooser";
import { UnlockScreen, useAutoLock } from "@/features/lock/unlock-screen";
import {
  FirstRun,
  type FirstRunApi,
  httpFirstRunApi,
} from "@/features/onboarding/first-run";
import {
  InstallHint,
  type StorageEnv,
} from "@/features/onboarding/install-hint";
import { authClient } from "./auth-client";
import { SignIn } from "./sign-in";

/** `null` = signed in but no identity yet (first run). Throws on anything but 200/404. */
export async function fetchVault(): Promise<IdentityVault | null> {
  const res = await fetch("/api/identity/vault", { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`vault: ${res.status}`);
  return decodeVault(await res.json());
}

export interface GateSession {
  pending: boolean;
  userId: string | null;
  email: string | null;
  refetch(): void;
}

type VaultState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; vault: IdentityVault | null };

type DeviceState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "slot"; slot: DeviceSlot };

/**
 * The app decides where a person goes (UX.md §3.0, ADR-0025, ADR-0037): signed out →
 * sign-in; no vault → first run, which asks for nothing; vault and this device's slot → the
 * key opens silently (app lock off); vault without a device slot → unlock (§3.1); unlocked
 * → the household gate (#63), then the app. Auto-lock with a device slot just reopens it.
 * Right after a passphrase unlock, the one-time passkey offer comes first (#75). While the
 * device slot is open, the app can add a recovery method from it (`RecoveryContext`).
 */
export function AppGateView({
  session,
  loadVault = fetchVault,
  devices = deviceSlotStore,
  keys = keySession,
  firstRunApi = httpFirstRunApi,
  householdApi,
  prf,
  signInApi,
  storageEnv,
  children,
}: {
  session: GateSession;
  loadVault?: () => Promise<IdentityVault | null>;
  devices?: (userId: string) => DeviceSlotStore;
  keys?: KeySession;
  firstRunApi?: FirstRunApi;
  householdApi?: HouseholdApi;
  prf?: PrfApi;
  signInApi?: SignInApi;
  storageEnv?: StorageEnv;
  children: ReactNode;
}) {
  const { status } = useSyncExternalStore(
    keys.subscribe,
    keys.state,
    keys.state,
  );
  const [vault, setVault] = useState<VaultState>({ status: "loading" });
  const [device, setDevice] = useState<DeviceState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [offerOpen, setOfferOpen] = useState(true);
  // Better Auth refetches the session on window focus and, while signed out, reports it
  // pending again. Only the first check may replace the screen; otherwise coming back from
  // the mail app unmounts sign-in and loses the code step (#82).
  const [settled, setSettled] = useState(!session.pending);
  const { userId, email } = session;
  const store = useMemo(
    () => (userId ? devices(userId) : null),
    [devices, userId],
  );
  useAutoLock(keys);

  useEffect(() => {
    if (!session.pending) setSettled(true);
  }, [session.pending]);

  useEffect(() => {
    if (status === "locked") setOfferOpen(true);
  }, [status]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on "Try again".
  useEffect(() => {
    if (!email || !store) return;
    let live = true;
    setVault({ status: "loading" });
    setDevice({ status: "loading" });
    Promise.all([loadVault(), store.load().catch(() => null)]).then(
      ([v, slot]) => {
        if (!live) return;
        setVault({ status: "ready", vault: v });
        const mine = v && slot && sameBytes(slot.publicKey, v.publicKey);
        setDevice(mine ? { status: "slot", slot } : { status: "none" });
      },
      () => live && setVault({ status: "error" }),
    );
    return () => {
      live = false;
    };
  }, [email, store, loadVault, attempt]);

  // App lock off: the device slot opens the key without asking (ADR-0037).
  const ready = vault.status === "ready" ? vault.vault : null;
  const slot = device.status === "slot" ? device.slot : null;
  useEffect(() => {
    if (!ready || !slot || status !== "locked") return;
    let live = true;
    openDeviceSlot(ready, slot).then(
      (identity) => live && keys.start(identity),
      () => live && setDevice({ status: "none" }),
    );
    return () => {
      live = false;
    };
  }, [ready, slot, status, keys]);

  const recovery = useMemo<RecoverySource | null>(
    () =>
      ready && slot && store && email
        ? {
            email,
            vault: ready,
            device: slot,
            async saveVault(next) {
              await firstRunApi.putVault(next);
              setVault({ status: "ready", vault: next });
            },
            async dropDeviceSlot() {
              await store.clear();
              setDevice({ status: "none" });
            },
          }
        : null,
    [ready, slot, store, email, firstRunApi],
  );

  if (session.pending && !settled) return <Centered>Loading…</Centered>;
  if (!email || !store)
    return <SignIn api={signInApi} onSignedIn={session.refetch} />;
  if (vault.status === "error")
    return (
      <Centered>
        <p>Couldn't load your account. Check your connection.</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-3 rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
        >
          Try again
        </button>
      </Centered>
    );
  if (vault.status === "loading" || device.status === "loading")
    return <Centered>Loading…</Centered>;
  if (!vault.vault)
    return (
      <FirstRun
        api={firstRunApi}
        keys={keys}
        store={store}
        onDone={(done) => {
          setVault({ status: "ready", vault: done.vault });
          setDevice({ status: "slot", slot: done.device });
        }}
      />
    );
  if (status !== "unlocked" && slot) return <Centered>Opening…</Centered>;
  if (status !== "unlocked" && !hasRecoveryMethod(vaultSlots(vault.vault)))
    return (
      <Centered>
        <p>
          Your key is only on the device you first signed in on. Open NetWorth
          there and add a way back in (passkey, passphrase or recovery kit).
        </p>
      </Centered>
    );
  if (status !== "unlocked")
    return (
      <UnlockScreen
        email={email}
        vault={vault.vault}
        session={keys}
        prf={prf}
        onVaultChanged={(next) => setVault({ status: "ready", vault: next })}
      />
    );
  if (offerOpen && keys.canEnrolPasskey())
    return (
      <EnrolOffer
        vault={vault.vault}
        keys={keys}
        prf={prf}
        putVault={firstRunApi.putVault}
        onEnrolled={(next) => setVault({ status: "ready", vault: next })}
        onClose={() => setOfferOpen(false)}
      />
    );
  // Household key: loaded after every unlock, or the waiting / confirm screens (#63).
  return (
    <RecoveryContext value={recovery}>
      {slot && <InstallHint env={storageEnv} />}
      <HouseholdGate keys={keys} api={householdApi}>
        {children}
      </HouseholdGate>
    </RecoveryContext>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-8 text-center text-sm text-neutral-500">
      {children}
    </main>
  );
}

/** The gate wired to Better Auth's session. */
export function AppGate({ children }: { children: ReactNode }) {
  const { data, isPending, refetch } = authClient.useSession();
  return (
    <AppGateView
      session={{
        pending: isPending,
        userId: data?.user.id ?? null,
        email: data?.user.email ?? null,
        refetch: () => void refetch(),
      }}
    >
      {children}
    </AppGateView>
  );
}
