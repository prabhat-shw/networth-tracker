/**
 * IndexedDB home of the device slot (ADR-0038). The device key is stored as a
 * non-extractable `CryptoKey` (structured clone keeps it opaque), so no script can read its
 * bytes; next to it sit only the public key and the wrapped private key. One record per
 * signed-in user, so two accounts in one browser never share a slot.
 */
import type { DeviceSlot, DeviceSlotStore } from "@/crypto/vault-device";

const DB = "nwt-device";
const STORE = "slots";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const isSlot = (x: unknown): x is DeviceSlot =>
  typeof x === "object" &&
  x !== null &&
  (x as DeviceSlot).key instanceof CryptoKey &&
  (x as DeviceSlot).publicKey instanceof Uint8Array &&
  (x as DeviceSlot).wrap instanceof Uint8Array;

/**
 * Asks the browser not to evict site data under storage pressure (ADR-0037). Best effort:
 * a refusal leaves the slot working until eviction, and the recovery method still restores.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function deviceSlotStore(userId: string): DeviceSlotStore {
  return {
    async load() {
      const value = await run<unknown>("readonly", (s) => s.get(userId));
      return isSlot(value) ? value : null;
    },
    async save(slot) {
      if (slot.key.extractable)
        throw new TypeError("device key must be non-extractable");
      const record: DeviceSlot = {
        key: slot.key,
        publicKey: slot.publicKey,
        wrap: slot.wrap,
      };
      await run("readwrite", (s) => s.put(record, userId));
      await requestPersistence();
    },
    async clear() {
      await run("readwrite", (s) => s.delete(userId));
    },
  };
}
