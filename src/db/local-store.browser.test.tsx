// The local record store in real IndexedDB (#116, ADR-0045/0047): ciphertext only, versions
// and the cursor never move backwards, and households never see each other's rows.
import { afterEach, describe, expect, it } from "vitest";
import { DecryptError } from "@/crypto/aead";
import { FIRST_KID, type HouseholdKey } from "@/crypto/household";
import { generateDataKey } from "@/crypto/keys";
import {
  decodeRecord,
  encodeRecord,
  type PlainRecord,
} from "@/crypto/record-codec";
import { DB_NAME, localStore } from "./local-store";

const HH_A = "0a000000-0000-4000-8000-00000000000a";
const HH_B = "0b000000-0000-4000-8000-00000000000b";
const R1 = "1a000000-0000-4000-8000-000000000001";
const R2 = "1a000000-0000-4000-8000-000000000002";
const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const SECRETS = ["PPF Sukanya", "folio-998877", "account", ASHA, "2026-10-12T"];

const a = localStore(HH_A);
const b = localStore(HH_B);

afterEach(async () => {
  await a.clear();
  await b.clear();
});

const hdk = async (): Promise<HouseholdKey> => ({
  householdId: HH_A,
  kid: FIRST_KID,
  key: await generateDataKey(),
});

const plain = (id: string, version: number): PlainRecord => ({
  id,
  version,
  deleted: false,
  type: "account",
  schemaVersion: 1,
  data: { name: "PPF Sukanya", folio: "folio-998877", balancePaise: 12_345_00 },
  modifiedAt: "2026-10-12T10:00:00.000Z",
  modifiedBy: ASHA,
});

/** Every row of every table in the records database, bytes rendered as Latin-1 text. */
async function dump(): Promise<{
  text: string;
  rows: Record<string, unknown>[];
}> {
  const idb = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    const rows: Record<string, unknown>[] = [];
    for (const name of idb.objectStoreNames) {
      const all = await new Promise<unknown[]>((resolve, reject) => {
        const req = idb.transaction(name).objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      rows.push(...(all as Record<string, unknown>[]));
    }
    const text = JSON.stringify(rows, (_k, v) =>
      v instanceof Uint8Array ? new TextDecoder("latin1").decode(v) : v,
    );
    return { text, rows };
  } finally {
    idb.close();
  }
}

describe("local record store", () => {
  it("holds only ciphertext and routing fields, never plaintext", async () => {
    const key = await hdk();
    const s1 = await encodeRecord(key, plain(R1, 1));
    const s2 = await encodeRecord(key, plain(R2, 1));
    // A caller passing a decrypted record by mistake still stores only the sealed fields.
    await a.putEnvelopes([{ ...plain(R1, 1), ...s1, seq: 1 }]);
    await a.enqueue({ ...plain(R2, 1), ...s2 });
    await a.advanceCursor(1);

    const { text, rows } = await dump();
    for (const s of SECRETS) expect(text).not.toContain(s);
    const allowed = [
      "householdId",
      "id",
      "version",
      "deleted",
      "ciphertext",
      "seq",
      "queuedAt",
      "cursor",
    ];
    for (const row of rows)
      for (const field of Object.keys(row)) expect(allowed).toContain(field);
    expect(rows).toHaveLength(3);
  });

  it("round-trips envelopes that decrypt, and never moves a record back a version", async () => {
    const key = await hdk();
    const v1 = await encodeRecord(key, plain(R1, 1));
    const v2 = await encodeRecord(key, plain(R1, 2));
    await a.putEnvelopes([{ ...v2, seq: 5 }]);
    await a.putEnvelopes([{ ...v1, seq: 3 }]); // a late, older copy
    const stored = await a.envelope(R1);
    expect(stored).toMatchObject({ version: 2, seq: 5 });
    expect(await a.knownVersion(R1)).toBe(2);
    expect(await a.knownVersion(R2)).toBe(0);
    if (!stored) throw new Error("missing");
    expect(
      (await decodeRecord(key, stored, await a.knownVersion(R1))).data,
    ).toEqual(plain(R1, 2).data);
    // The stored version is the replay floor: the older envelope is refused.
    await expect(
      decodeRecord(key, v1, await a.knownVersion(R1)),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it("only moves the cursor forward", async () => {
    expect(await a.cursor()).toBe(0);
    await a.advanceCursor(7);
    await a.advanceCursor(3);
    expect(await a.cursor()).toBe(7);
  });

  it("keeps one queued write per record and dequeues only the version pushed", async () => {
    let t = 0;
    const q = localStore(HH_A, () => ++t);
    const key = await hdk();
    await q.enqueue(await encodeRecord(key, plain(R2, 1)));
    await q.enqueue(await encodeRecord(key, plain(R1, 1)));
    await q.enqueue(await encodeRecord(key, plain(R1, 2))); // a second edit before pushing
    expect((await q.outbox()).map((o) => [o.id, o.version])).toEqual([
      [R2, 1],
      [R1, 2],
    ]);
    await q.dequeue(R1, 1); // a push of v1 finished, but v2 is still pending
    await q.dequeue(R2, 1);
    expect((await q.outbox()).map((o) => [o.id, o.version])).toEqual([[R1, 2]]);
  });

  it("keeps households apart, and clear forgets only one", async () => {
    const key = await hdk();
    const s = await encodeRecord(key, plain(R1, 1));
    await a.putEnvelopes([{ ...s, seq: 1 }]);
    await b.putEnvelopes([{ ...s, seq: 9 }]);
    await a.enqueue(s);
    await a.advanceCursor(1);
    await b.advanceCursor(9);
    expect((await b.envelope(R1))?.seq).toBe(9);
    await a.clear();
    expect(await a.envelopes()).toEqual([]);
    expect(await a.outbox()).toEqual([]);
    expect(await a.cursor()).toBe(0);
    expect(await b.envelopes()).toHaveLength(1);
    expect(await b.cursor()).toBe(9);
  });
});
