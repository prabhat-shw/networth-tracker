"use client";

import {
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { IdentityVault } from "@/crypto/vault";
import { decodeVault } from "@/crypto/wire";
import type { HouseholdApi } from "@/features/household/household-client";
import { HouseholdGate } from "@/features/household/household-gate";
import { EnrolOffer } from "@/features/lock/enrol-offer";
import { type KeySession, keySession } from "@/features/lock/key-session";
import type { PrfApi } from "@/features/lock/passkey-prf";
import { UnlockScreen, useAutoLock } from "@/features/lock/unlock-screen";
import { FirstRun, type FirstRunApi } from "@/features/onboarding/first-run";
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
  email: string | null;
  refetch(): void;
}

type VaultState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; vault: IdentityVault | null };

/**
 * The app decides where a person goes (UX.md §3.0, ADR-0025): signed out → sign-in; no
 * vault → first run (#53); vault → unlock (§3.1); unlocked → the household gate (#63),
 * which loads the household key or shows the waiting / confirm screens, then the app. Re-locking returns here, to the unlock screen, without
 * signing out. Right after a passphrase unlock, the one-time passkey offer comes first (#75).
 */
export function AppGateView({
  session,
  loadVault = fetchVault,
  keys = keySession,
  firstRunApi,
  householdApi,
  prf,
  children,
}: {
  session: GateSession;
  loadVault?: () => Promise<IdentityVault | null>;
  keys?: KeySession;
  firstRunApi?: FirstRunApi;
  householdApi?: HouseholdApi;
  prf?: PrfApi;
  children: ReactNode;
}) {
  const { status } = useSyncExternalStore(
    keys.subscribe,
    keys.state,
    keys.state,
  );
  const [vault, setVault] = useState<VaultState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [offerOpen, setOfferOpen] = useState(true);
  useAutoLock(keys);

  useEffect(() => {
    if (status === "locked") setOfferOpen(true);
  }, [status]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on "Try again".
  useEffect(() => {
    if (!session.email) return;
    let live = true;
    setVault({ status: "loading" });
    loadVault().then(
      (v) => live && setVault({ status: "ready", vault: v }),
      () => live && setVault({ status: "error" }),
    );
    return () => {
      live = false;
    };
  }, [session.email, loadVault, attempt]);

  if (session.pending) return <Centered>Loading…</Centered>;
  if (!session.email) return <SignIn onSignedIn={session.refetch} />;
  if (vault.status === "loading") return <Centered>Loading…</Centered>;
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
  if (!vault.vault)
    return (
      <FirstRun
        email={session.email}
        api={firstRunApi}
        keys={keys}
        onDone={(done) => setVault({ status: "ready", vault: done.vault })}
      />
    );
  if (status !== "unlocked")
    return (
      <UnlockScreen
        email={session.email}
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
        putVault={firstRunApi?.putVault}
        onEnrolled={(next) => setVault({ status: "ready", vault: next })}
        onClose={() => setOfferOpen(false)}
      />
    );
  // Household key: loaded after every unlock, or the waiting / confirm screens (#63).
  return (
    <HouseholdGate keys={keys} api={householdApi}>
      {children}
    </HouseholdGate>
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
        email: data?.user.email ?? null,
        refetch: () => void refetch(),
      }}
    >
      {children}
    </AppGateView>
  );
}
