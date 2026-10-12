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
import { httpTransport } from "./http-transport";
import { browserEnv, type SyncEnv, startSyncScheduler } from "./scheduler";

const NONE: PlainRecord[] = [];

export interface HouseholdSync {
  householdId: string;
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
  ): Promise<PlainRecord>;
  /** Runs a sync now (shares a run already in flight). */
  sync(): Promise<SyncResult>;
  /** Fires after hydrate, after every local write and after every sync run. */
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
  const notify = () => {
    snapshot = cache.size() ? cache.all() : NONE;
    for (const listener of listeners) listener();
  };
  // A lock empties the cache; the snapshot must not outlive it.
  const unfollow = session.subscribe(() => {
    if (session.state().status !== "unlocked") notify();
  });
  let stopScheduler: (() => void) | null = null;
  let stopped = false;

  engine.hydrate().then(() => {
    notify();
    if (stopped) return;
    stopScheduler = startSyncScheduler({
      session,
      engine,
      env,
      onResult: notify,
      onError,
    });
  }, onError);

  return {
    householdId,
    records: () => snapshot,
    async write(id, type, data, deleted = false) {
      const content: RecordContent = {
        type,
        schemaVersion: 1,
        data,
        modifiedAt: now().toISOString(),
        modifiedBy: userId,
      };
      const record = await engine.write(id, content, deleted);
      notify();
      engine.sync().then(notify, onError);
      return record;
    },
    async sync() {
      try {
        return await engine.sync();
      } finally {
        notify();
      }
    },
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
