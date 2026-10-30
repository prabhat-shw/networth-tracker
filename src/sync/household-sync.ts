/**
 * One household's sync, started once its key is in the session (ADR-0050): the device's
 * ciphertext store, the in-memory plaintext cache, the engine and its scheduler. Hydrates
 * from the store first, so records show before the network answers. `stop()` tears it all
 * down; a lock does too (the cache empties and the scheduler stops on its own).
 */
import type { PlainRecord, RecordContent } from "@/crypto/record-codec";
import { type LocalStore, localStore } from "@/db/local-store";
import { createRecordCache } from "@/db/record-cache";
import type { KeySession } from "@/features/lock/key-session";
import { createSyncEngine, type SyncResult, type Transport } from "./engine";
import { httpTransport, SyncHttpError } from "./http-transport";
import { browserEnv, type SyncEnv, startSyncScheduler } from "./scheduler";

const NONE: PlainRecord[] = [];

/**
 * What the sync indicator shows (UX.md §2.3). `recovery` is the ADR-0040 `409`: this member
 * has no recovery method yet, so their edits stay in the outbox until they add one.
 */
export type SyncState = "syncing" | "synced" | "offline" | "recovery";

export interface SyncStatus {
  state: SyncState;
  /** When a run last finished cleanly; null until one does. */
  lastSyncedAt: Date | null;
  /** Edits on this device that the server doesn't have yet. */
  pending: boolean;
}

/** A failed run: a push refused for want of a recovery method, or anything else (offline). */
const failedState = (error: unknown): SyncState =>
  error instanceof SyncHttpError && error.status === 409
    ? "recovery"
    : "offline";

export interface HouseholdSync {
  householdId: string;
  /** The signed-in member, who is `modifiedBy` on every write. */
  userId: string;
  /**
   * Decrypted live records (tombstones excluded), in memory only. The same array until the
   * next notification, so it can back `useSyncExternalStore`; empty once locked or stopped.
   */
  records(): PlainRecord[];
  /** Seals and queues an edit by this member, then syncs in the background. */
  write(
    id: string,
    type: string,
    data: unknown,
    deleted?: boolean,
    schemaVersion?: number,
  ): Promise<PlainRecord>;
  /** The latest sync status; the same object until it changes, like `records()`. */
  status(): SyncStatus;
  /** Runs a sync now (shares a run already in flight). */
  sync(): Promise<SyncResult>;
  /** Fires after hydrate, after every local write, and when a sync run starts and ends. */
  subscribe(listener: () => void): () => void;
  stop(): void;
}

export interface HouseholdSyncOptions {
  session: KeySession;
  /** The signed-in member: `modifiedBy` on every edit (ADR-0045). */
  userId: string;
  transport?: Transport;
  store?: LocalStore;
  env?: SyncEnv;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

export function startHouseholdSync({
  session,
  userId,
  transport,
  store,
  env = browserEnv(),
  now = () => new Date(),
  // Offline or server down: the next trigger retries, so a failed run is not fatal.
  onError = () => {},
}: HouseholdSyncOptions): HouseholdSync {
  const hk = session.householdKey();
  if (!hk) throw new Error("household key is not loaded");
  const { householdId } = hk;
  const cache = createRecordCache(session);
  // Bound to this household: a key for another one (never expected) stops the engine.
  const hdk = () => {
    const k = session.householdKey();
    return k?.householdId === householdId ? k : null;
  };
  const engine = createSyncEngine({
    transport: transport ?? httpTransport(householdId),
    store: store ?? localStore(householdId),
    cache,
    hdk,
  });
  const listeners = new Set<() => void>();
  let snapshot: PlainRecord[] = NONE;
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const notify = () => {
    snapshot = cache.size() ? cache.all() : NONE;
    emit();
  };
  // A lock empties the cache; the snapshot must not outlive it.
  const unfollow = session.subscribe(() => {
    if (session.state().status !== "unlocked") notify();
  });
  let status: SyncStatus = {
    state: "syncing",
    lastSyncedAt: null,
    pending: false,
  };
  const setStatus = (next: Partial<SyncStatus>) => {
    status = { ...status, ...next };
  };
  // Every run goes through here, so the indicator sees the scheduler's runs as well as ours.
  const run = async (): Promise<SyncResult> => {
    if (status.state !== "syncing") {
      setStatus({ state: "syncing" });
      emit(); // records are unchanged, so the snapshot stays the same array
    }
    try {
      const result = await engine.sync();
      setStatus({
        state: "synced",
        lastSyncedAt: now(),
        pending: result.pending,
      });
      return result;
    } catch (error) {
      setStatus({ state: failedState(error) });
      throw error;
    } finally {
      notify();
    }
  };
  let stopScheduler: (() => void) | null = null;
  let stopped = false;

  engine.hydrate().then(() => {
    notify();
    if (stopped) return;
    stopScheduler = startSyncScheduler({
      session,
      engine: { sync: run },
      env,
      onError,
    });
  }, onError);

  return {
    householdId,
    userId,
    records: () => snapshot,
    async write(id, type, data, deleted = false, schemaVersion = 1) {
      const content: RecordContent = {
        type,
        schemaVersion,
        data,
        modifiedAt: now().toISOString(),
        modifiedBy: userId,
      };
      const record = await engine.write(id, content, deleted);
      setStatus({ pending: true });
      notify();
      run().catch(onError);
      return record;
    },
    status: () => status,
    sync: run,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      stopped = true;
      stopScheduler?.();
      unfollow();
      cache.dispose();
      snapshot = NONE;
      listeners.clear();
    },
  };
}
