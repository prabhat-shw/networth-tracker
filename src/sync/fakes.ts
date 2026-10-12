// Test-only fakes for the sync engine: an in-memory server that follows the CONTRACT.md
// Records rules (ADR-0045) and an in-memory `LocalStore` with the same rules as Dexie's.
import type { SealedRecord } from "@/crypto/record-codec";
import type { LocalStore, OutboxEntry, StoredEnvelope } from "@/db/local-store";
import type { RemoteEnvelope, Transport } from "./engine";
import { PULL_PAGE } from "./engine";

export interface FakeServer {
  rows: Map<string, RemoteEnvelope>;
  /** A transport for one device; `offline()` makes every call throw until `online()`. */
  connect(): Transport & { offline(): void; online(): void; calls: number };
  /** Next push answers every record as a conflict with the stored copy (contention). */
  forceConflicts: number;
}

export function fakeServer(): FakeServer {
  const rows = new Map<string, RemoteEnvelope>();
  let seq = 0;
  const server: FakeServer = {
    rows,
    forceConflicts: 0,
    connect() {
      let up = true;
      const t = {
        calls: 0,
        offline() {
          up = false;
        },
        online() {
          up = true;
        },
        async pull(since: number) {
          t.calls++;
          if (!up) throw new TypeError("offline");
          return [...rows.values()]
            .filter((r) => r.seq > since)
            .sort((a, b) => a.seq - b.seq)
            .slice(0, PULL_PAGE)
            .map((r) => ({ ...r }));
        },
        async push(records: SealedRecord[]) {
          t.calls++;
          if (!up) throw new TypeError("offline");
          const applied: { id: string; version: number; seq: number }[] = [];
          const conflicts: RemoteEnvelope[] = [];
          const force = server.forceConflicts > 0;
          if (force) server.forceConflicts--;
          for (const r of records) {
            const cur = rows.get(r.id);
            const fits = cur ? cur.version === r.version - 1 : r.version === 1;
            if (!fits || (force && cur)) {
              if (cur) conflicts.push({ ...cur });
              else throw new Error("400: unknown base");
              continue;
            }
            seq += 1;
            rows.set(r.id, { ...r, seq });
            applied.push({ id: r.id, version: r.version, seq });
          }
          return { applied, conflicts };
        },
      };
      return t;
    },
  };
  return server;
}

export function memoryStore(householdId = "hh"): LocalStore {
  const envelopes = new Map<string, StoredEnvelope>();
  const outbox = new Map<string, OutboxEntry>();
  let cursor = 0;
  let clock = 0;
  const sealed = (r: SealedRecord) => ({
    id: r.id,
    version: r.version,
    deleted: r.deleted,
    ciphertext: r.ciphertext,
  });
  return {
    envelopes: async () => [...envelopes.values()],
    envelope: async (id) => envelopes.get(id),
    async putEnvelopes(list) {
      for (const r of list) {
        const cur = envelopes.get(r.id);
        if (cur && cur.version > r.version) continue;
        envelopes.set(r.id, { householdId, seq: r.seq, ...sealed(r) });
      }
    },
    knownVersion: async (id) => envelopes.get(id)?.version ?? 0,
    cursor: async () => cursor,
    async advanceCursor(seq) {
      cursor = Math.max(cursor, seq);
    },
    async enqueue(r) {
      outbox.set(r.id, { householdId, queuedAt: ++clock, ...sealed(r) });
    },
    outbox: async () =>
      [...outbox.values()].sort((a, b) => a.queuedAt - b.queuedAt),
    async dequeue(id, version) {
      if (outbox.get(id)?.version === version) outbox.delete(id);
    },
    async clear() {
      envelopes.clear();
      outbox.clear();
      cursor = 0;
    },
  };
}
