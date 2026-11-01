"use client";

import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { PlainRecord } from "@/crypto/record-codec";
import type { Universes } from "@/domain/prices/universe";
import type { KeySession } from "@/features/lock/key-session";
import {
  type HouseholdSync,
  type HouseholdSyncOptions,
  type SyncStatus,
  startHouseholdSync,
} from "@/sync/household-sync";

const SyncContext = createContext<HouseholdSync | null>(null);

/**
 * Starts the household's sync (ADR-0050). Mounted inside the household gate, so it exists
 * only while unlocked with the household key loaded; unmounting (lock, sign-out) stops it.
 * The handle holds no keys: the engine reads the HDK from the session on every step.
 */
export function SyncProvider({
  keys,
  userId,
  start = startHouseholdSync,
  children,
}: {
  keys: KeySession;
  userId: string;
  start?: (options: HouseholdSyncOptions) => HouseholdSync;
  children: ReactNode;
}) {
  const [sync, setSync] = useState<HouseholdSync | null>(null);
  useEffect(() => {
    const handle = start({ session: keys, userId });
    setSync(handle);
    return () => {
      handle.stop();
      setSync(null);
    };
  }, [keys, userId, start]);
  return <SyncContext value={sync}>{children}</SyncContext>;
}

/** The running sync, or null before it starts. */
export const useHouseholdSync = () => use(SyncContext);

const NONE: PlainRecord[] = [];
const idle = () => () => {};
const none = () => NONE;

/** Live decrypted records; re-renders after every write and sync run. */
export function useRecords(): PlainRecord[] {
  const sync = useHouseholdSync();
  return useSyncExternalStore(
    sync ? sync.subscribe : idle,
    sync ? sync.records : none,
    none,
  );
}

const NOT_STARTED: SyncStatus = {
  state: "syncing",
  lastSyncedAt: null,
  pending: false,
};
const notStarted = () => NOT_STARTED;

/** The sync indicator's state (UX.md §2.3); "syncing" until the sync starts. */
export function useSyncStatus(): SyncStatus {
  const sync = useHouseholdSync();
  return useSyncExternalStore(
    sync ? sync.subscribe : idle,
    sync ? sync.status : notStarted,
    notStarted,
  );
}

const NO_PRICES: Universes = {};
const noPrices = () => NO_PRICES;

/** The device's cached price universes; re-renders when a newer file is saved. */
export function useUniverses(): Universes {
  const sync = useHouseholdSync();
  return useSyncExternalStore(
    sync ? sync.subscribe : idle,
    sync ? sync.universes : noPrices,
    noPrices,
  );
}
