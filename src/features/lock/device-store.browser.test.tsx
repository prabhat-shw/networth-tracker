// Device slot in real IndexedDB (ADR-0038): the key survives a reload as a non-extractable
// CryptoKey, and nothing but that key, the public key and wrapped bytes is stored.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addPassphraseFromDevice,
  createDeviceIdentity,
  createDeviceSlot,
  deviceSlotByPassphrase,
  openDeviceSlot,
} from "@/crypto/vault-device";
import { deviceSlotStore } from "./device-store";

const USER = "0a000000-0000-4000-8000-0000000000a1";
const store = deviceSlotStore(USER);

afterEach(async () => {
  await store.clear();
  vi.restoreAllMocks();
});

/** Every value in the device database, read back raw. */
function dump(): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("nwt-device");
    req.onsuccess = () => {
      const db = req.result;
      const all = db.transaction("slots").objectStore("slots").getAll();
      all.onsuccess = () => {
        db.close();
        resolve(all.result);
      };
      all.onerror = () => reject(all.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe("device slot store", () => {
  it("round-trips the slot; the reloaded key is non-extractable and opens the vault", async () => {
    const persist = vi.spyOn(navigator.storage, "persist");
    const { vault, device } = await createDeviceIdentity();
    await store.save(device);
    expect(persist).toHaveBeenCalled();

    const loaded = await store.load();
    if (!loaded) throw new Error("slot not stored");
    expect(loaded.key).not.toBe(device.key);
    expect(loaded.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", loaded.key)).rejects.toThrow();
    const identity = await openDeviceSlot(vault, loaded);
    expect(identity.privateKey.extractable).toBe(false);
  });

  it("stores nothing but the key, the public key and the wrap", async () => {
    const { device } = await createDeviceIdentity();
    await store.save({ ...device, extra: "plaintext" } as typeof device);
    const rows = await dump();
    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(["key", "publicKey", "wrap"]);
    expect(row.key).toBeInstanceOf(CryptoKey);
  });

  it("refuses an extractable key", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );
    const device = await createDeviceSlot(new Uint8Array(65), pair.privateKey);
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["wrapKey", "unwrapKey"],
    );
    await expect(store.save({ ...device, key })).rejects.toThrow(TypeError);
    expect(await store.load()).toBeNull();
  });

  it("clear forgets the slot; other users' slots are separate", async () => {
    const other = deviceSlotStore("someone-else");
    const { device } = await createDeviceIdentity();
    await store.save(device);
    await other.save(device);
    await store.clear();
    expect(await store.load()).toBeNull();
    expect(await other.load()).not.toBeNull();
    await other.clear();
  });

  it("app lock: off keeps only a slot rebuilt from the passphrase; on leaves no key material at all", async () => {
    const made = await createDeviceIdentity();
    const vault = await addPassphraseFromDevice(made.vault, made.device, "pw");
    // Signed in elsewhere with the passphrase, then app lock turned off (ADR-0043).
    await store.save(await deviceSlotByPassphrase(vault, "pw"));
    const slot = await store.load();
    expect(slot?.key.extractable).toBe(false);
    if (slot) await openDeviceSlot(vault, slot);
    expect(await dump()).toHaveLength(1);
    // App lock on: the device key is forgotten, and the database is empty.
    await store.clear();
    expect(await dump()).toEqual([]);
  });
});
