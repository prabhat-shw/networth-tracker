/**
 * The sync engine (ADR-0003, ADR-0045, ADR-0049). Pure over an injected transport, store and
 * cache, so it runs the same against the real server, a fake one, IndexedDB or memory.
 *
 * One `sync()` pulls every envelope after the cursor, then pushes the outbox. A remote write
 * that meets a pending local edit of the same record is merged with LWW: if the local edit
 * wins it is re-sealed on top of the remote version and queued again, otherwise it is dropped.
 * A conflicting push is handled the same way and retried, at most `maxRounds` times.
 * Tombstones stay sealed in the store (they are the conflict base and replay floor) and are
 * never held as plaintext.
 */
import type { HouseholdKey } from "@/crypto/household";
import {
  decodeRecord,
  encodeRecord,
  type PlainRecord,
  type RecordContent,
  type SealedRecord,
} from "@/crypto/record-codec";
import type { LocalStore } from "@/db/local-store";
import type { RecordCache } from "@/db/record-cache";
import { mergeLww } from "@/domain/lww";

export const PULL_PAGE = 500;
export const PUSH_BATCH = 100;

export type RemoteEnvelope = SealedRecord & { seq: number };

export interface Transport {
  /** Envelopes with `seq > since`, ascending, at most `PULL_PAGE`. */
  pull(since: number): Promise<RemoteEnvelope[]>;
  push(records: SealedRecord[]): Promise<{
    applied: { id: string; version: number; seq: number }[];
    conflicts: RemoteEnvelope[];
  }>;
}

export interface SyncDeps {
  transport: Transport;
  store: LocalStore;
  cache: RecordCache;
  /** The unlocked household key, or null once locked (the engine then stops). */
  hdk: () => HouseholdKey | null;
  maxRounds?: number;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: number;
  /** Envelopes that failed to decrypt (tampered, replayed, wrong key): skipped, not stored. */
  rejected: number;
  /** True if the outbox still holds writes after `maxRounds` push rounds. */
  pending: boolean;
}

export class LockedError extends Error {
  constructor() {
    super("household key is locked");
    this.name = "LockedError";
  }
}

export interface SyncEngine {
  /** Decrypts the stored records (and pending edits) into the cache. */
  hydrate(): Promise<void>;
  /** A local edit: sealed on top of the stored version, queued, and cached. */
  write(
    id: string,
    content: RecordContent,
    deleted?: boolean,
  ): Promise<PlainRecord>;
  /** Pull, then push; concurrent calls share one run. */
  sync(): Promise<SyncResult>;
}

export function createSyncEngine({
  transport,
  store,
  cache,
  hdk,
  maxRounds = 3,
}: SyncDeps): SyncEngine {
  let running: Promise<SyncResult> | null = null;

  const key = () => {
    const k = hdk();
    if (!k) throw new LockedError();
    return k;
  };

  const show = (record: PlainRecord) => {
    if (record.deleted) cache.delete(record.id);
    else cache.set(record);
  };

  /** Queues `content` at `version`, replacing any pending edit of the record. */
  async function queue(
    id: string,
    version: number,
    content: RecordContent,
    deleted: boolean,
  ): Promise<PlainRecord> {
    const record: PlainRecord = { id, version, deleted, ...content };
    await store.enqueue(await encodeRecord(key(), record));
    show(record);
    return record;
  }

  /**
   * A remote envelope arrived (pull or push conflict). Returns false if it failed to decrypt.
   * A pending edit built on an older base is merged: the winner is what this device shows.
   */
  async function receive(remote: RemoteEnvelope): Promise<boolean> {
    const k = key();
    let plain: PlainRecord;
    try {
      plain = await decodeRecord(
        k,
        remote,
        await store.knownVersion(remote.id),
      );
    } catch {
      return false;
    }
    await store.putEnvelopes([remote]);
    const pending = (await store.outbox()).find((o) => o.id === remote.id);
    if (pending && pending.version <= remote.version) {
      const mine = await decodeRecord(k, pending);
      const winner = mergeLww(mine, plain);
      if (winner === mine) {
        const { id, version: _v, deleted, ...content } = mine;
        await queue(id, remote.version + 1, content, deleted);
        return true;
      }
      await store.dequeue(pending.id, pending.version);
    } else if (pending) return true; // remote is our base or older: the pending edit stands
    show(plain);
    return true;
  }

  async function run(): Promise<SyncResult> {
    const result: SyncResult = {
      pulled: 0,
      pushed: 0,
      conflicts: 0,
      rejected: 0,
      pending: false,
    };

    // Pull to the end. The cursor advances past envelopes that fail to decrypt: retrying
    // them cannot succeed, and the store keeps the last good copy.
    for (;;) {
      const page = await transport.pull(await store.cursor());
      for (const env of page) {
        if (await receive(env)) result.pulled++;
        else result.rejected++;
        await store.advanceCursor(env.seq);
      }
      if (page.length < PULL_PAGE) break;
    }

    for (let round = 0; round < maxRounds; round++) {
      const outbox = await store.outbox();
      if (outbox.length === 0) break;
      for (let i = 0; i < outbox.length; i += PUSH_BATCH) {
        const batch = outbox.slice(i, i + PUSH_BATCH);
        const { applied, conflicts } = await transport.push(
          batch.map(({ id, version, deleted, ciphertext }) => ({
            id,
            version,
            deleted,
            ciphertext,
          })),
        );
        const sent = new Map(batch.map((o) => [o.id, o]));
        for (const a of applied) {
          const o = sent.get(a.id);
          if (!o || o.version !== a.version) continue;
          await store.putEnvelopes([{ ...o, seq: a.seq }]);
          await store.dequeue(o.id, o.version);
          result.pushed++;
        }
        for (const c of conflicts) {
          result.conflicts++;
          if (!(await receive(c))) {
            // The server's copy is unreadable: keep ours queued, the next run retries.
            result.rejected++;
          }
        }
      }
    }
    result.pending = (await store.outbox()).length > 0;
    return result;
  }

  return {
    async hydrate() {
      const k = key();
      for (const env of await store.envelopes()) {
        try {
          show(await decodeRecord(k, env));
        } catch {
          // A stored envelope that no longer opens (e.g. a rotated key) is left for re-pull.
        }
      }
      for (const o of await store.outbox()) show(await decodeRecord(k, o));
    },
    async write(id, content, deleted = false) {
      const base = (await store.envelope(id))?.version ?? 0;
      return queue(id, base + 1, content, deleted);
    },
    sync() {
      running ??= run().finally(() => {
        running = null;
      });
      return running;
    },
  };
}
