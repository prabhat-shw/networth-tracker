/**
 * Decrypted records, in memory only (ADR-0024, ADR-0047). The cache follows the key session:
 * the moment the session leaves "unlocked" (lock, auto-lock, a new unlock starting), every
 * plaintext record is dropped. Nothing here is ever written to storage.
 */
import type { PlainRecord } from "@/crypto/record-codec";
import type { KeySession } from "@/features/lock/key-session";

export interface RecordCache {
  get(id: string): PlainRecord | undefined;
  all(): PlainRecord[];
  /** Ignored while locked, so a decrypt that finishes after a lock cannot repopulate it. */
  set(record: PlainRecord): void;
  delete(id: string): void;
  size(): number;
  clear(): void;
  /** Stops following the session (and clears). */
  dispose(): void;
}

export function createRecordCache(
  session: Pick<KeySession, "state" | "subscribe">,
): RecordCache {
  const records = new Map<string, PlainRecord>();
  const unlocked = () => session.state().status === "unlocked";
  const unsubscribe = session.subscribe(() => {
    if (!unlocked()) records.clear();
  });
  return {
    get: (id) => records.get(id),
    all: () => [...records.values()],
    set(record) {
      if (unlocked()) records.set(record.id, record);
    },
    delete: (id) => void records.delete(id),
    size: () => records.size,
    clear: () => records.clear(),
    dispose() {
      unsubscribe();
      records.clear();
    },
  };
}
