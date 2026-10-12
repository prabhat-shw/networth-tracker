/**
 * The device's copy of household records (ADR-0045, ADR-0047), in IndexedDB via Dexie.
 * Ciphertext only: every row is built field by field from a `SealedRecord`, so a plaintext
 * field can never ride along. Decrypted records live in memory (`record-cache.ts`).
 *
 * - `envelopes`: the newest envelope seen per record. A write never moves a record back to
 *   an older version, so the stored version doubles as the replay floor for `decodeRecord`.
 * - `outbox`: local writes waiting to be pushed, at most one per record (the latest).
 * - `meta`: the pull cursor (`seq`), which only moves forward.
 */
import Dexie, { type EntityTable, type Table } from "dexie";
import type { Bytes } from "@/crypto/kdf";
import type { SealedRecord } from "@/crypto/record-codec";

export const DB_NAME = "nwt-records";

export interface StoredEnvelope extends SealedRecord {
  householdId: string;
  /** Server cursor of this envelope (ADR-0045). */
  seq: number;
}

export interface OutboxEntry extends SealedRecord {
  householdId: string;
  /** Local clock when queued; orders the push. */
  queuedAt: number;
}

interface Meta {
  householdId: string;
  cursor: number;
}

type RecordsDb = Dexie & {
  envelopes: Table<StoredEnvelope, [string, string]>;
  outbox: Table<OutboxEntry, [string, string]>;
  meta: EntityTable<Meta, "householdId">;
};

let shared: RecordsDb | null = null;

function db(): RecordsDb {
  if (shared) return shared;
  const d = new Dexie(DB_NAME) as RecordsDb;
  d.version(1).stores({
    envelopes: "[householdId+id], householdId",
    outbox: "[householdId+id], householdId",
    meta: "householdId",
  });
  shared = d;
  return d;
}

/** Copies only the sealed fields: ciphertext is the one place record content may live. */
const sealedFields = (r: SealedRecord) => ({
  id: r.id,
  version: r.version,
  deleted: r.deleted,
  ciphertext: r.ciphertext as Bytes,
});

export interface LocalStore {
  envelopes(): Promise<StoredEnvelope[]>;
  envelope(id: string): Promise<StoredEnvelope | undefined>;
  /** Saves pulled or pushed envelopes; ones older than what is stored are ignored. */
  putEnvelopes(list: (SealedRecord & { seq: number })[]): Promise<void>;
  /** Highest version this device holds for `id`: the replay floor (0 if none). */
  knownVersion(id: string): Promise<number>;
  cursor(): Promise<number>;
  /** Moves the cursor forward; a smaller value is ignored. */
  advanceCursor(seq: number): Promise<void>;
  enqueue(record: SealedRecord): Promise<void>;
  outbox(): Promise<OutboxEntry[]>;
  /** Drops the queued write for `id` only if it is still `version` (a newer edit stays). */
  dequeue(id: string, version: number): Promise<void>;
  /** Forgets this household on this device (sign-out, leaving the household). */
  clear(): Promise<void>;
}

export function localStore(householdId: string, now = Date.now): LocalStore {
  const d = db();
  return {
    envelopes: () => d.envelopes.where({ householdId }).toArray(),
    envelope: (id) => d.envelopes.get([householdId, id]),
    putEnvelopes: (list) =>
      d.transaction("rw", d.envelopes, async () => {
        for (const r of list) {
          const cur = await d.envelopes.get([householdId, r.id]);
          if (cur && cur.version > r.version) continue;
          await d.envelopes.put({
            householdId,
            seq: r.seq,
            ...sealedFields(r),
          });
        }
      }),
    async knownVersion(id) {
      return (await d.envelopes.get([householdId, id]))?.version ?? 0;
    },
    async cursor() {
      return (await d.meta.get(householdId))?.cursor ?? 0;
    },
    advanceCursor: (seq) =>
      d.transaction("rw", d.meta, async () => {
        const cur = (await d.meta.get(householdId))?.cursor ?? 0;
        if (seq > cur) await d.meta.put({ householdId, cursor: seq });
      }),
    async enqueue(record) {
      await d.outbox.put({
        householdId,
        queuedAt: now(),
        ...sealedFields(record),
      });
    },
    async outbox() {
      const all = await d.outbox.where({ householdId }).toArray();
      return all.sort((a, b) => a.queuedAt - b.queuedAt);
    },
    dequeue: (id, version) =>
      d.transaction("rw", d.outbox, async () => {
        const cur = await d.outbox.get([householdId, id]);
        if (cur?.version === version) await d.outbox.delete([householdId, id]);
      }),
    clear: () =>
      d.transaction("rw", [d.envelopes, d.outbox, d.meta], async () => {
        await d.envelopes.where({ householdId }).delete();
        await d.outbox.where({ householdId }).delete();
        await d.meta.delete(householdId);
      }),
  };
}
