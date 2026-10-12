import { describe, expect, it } from "vitest";
import {
  DecryptError,
  encodeEnvelope,
  open,
  parseEnvelope,
  recordAad,
  seal,
} from "./aead";
import { FIRST_KID, type HouseholdKey } from "./household";
import type { Bytes } from "./kdf";
import { generateDataKey } from "./keys";
import {
  decodeRecord,
  encodeRecord,
  PAD_BLOCK,
  type PlainRecord,
  pad,
  type SealedRecord,
  unpad,
} from "./record-codec";

const ID = "5f1c2a7e-0000-4000-8000-000000000001";
const OTHER_ID = "5f1c2a7e-0000-4000-8000-000000000002";
const ASHA = "0a000000-0000-4000-8000-0000000000a1";

const hdkFor = async (householdId: string): Promise<HouseholdKey> => ({
  householdId,
  kid: FIRST_KID,
  key: await generateDataKey(),
});

const record = (over: Partial<PlainRecord> = {}): PlainRecord => ({
  id: ID,
  version: 1,
  deleted: false,
  type: "account",
  schemaVersion: 1,
  data: { name: "PPF", balancePaise: 1_50_000_00 },
  modifiedAt: "2026-10-12T10:00:00.000Z",
  modifiedBy: ASHA,
  ...over,
});

const rejects = (p: Promise<unknown>) =>
  expect(p).rejects.toBeInstanceOf(DecryptError);

describe("padding (ADR-0045)", () => {
  it("pads to whole 256-byte blocks with at least one byte, and round-trips", () => {
    for (const n of [0, 1, 255, 256, 257, 1000]) {
      const bytes = new Uint8Array(n).fill(0x80);
      const padded = pad(bytes);
      expect(padded.length % PAD_BLOCK).toBe(0);
      expect(padded.length).toBeGreaterThan(n);
      expect(padded.length - n).toBeLessThanOrEqual(PAD_BLOCK);
      expect(unpad(padded)).toEqual(bytes);
    }
  });

  it("refuses padding that pad() could not have produced", () => {
    expect(() => unpad(new Uint8Array(0))).toThrow(DecryptError);
    expect(() => unpad(new Uint8Array(255))).toThrow(DecryptError);
    expect(() => unpad(new Uint8Array(256))).toThrow(DecryptError); // no 0x80 mark
    const bad = new Uint8Array(256);
    bad[255] = 1;
    expect(() => unpad(bad)).toThrow(DecryptError);
    const tooLong = new Uint8Array(512);
    tooLong[0] = 0x80; // 512 bytes of padding: more than one block
    expect(() => unpad(tooLong)).toThrow(DecryptError);
  });
});

describe("record codec", () => {
  it("round-trips a record and a tombstone", async () => {
    const hdk = await hdkFor("hh-1");
    for (const r of [
      record(),
      record({ version: 4, deleted: true, data: null }),
    ]) {
      const sealed = await encodeRecord(hdk, r);
      expect(sealed).toMatchObject({
        id: r.id,
        version: r.version,
        deleted: r.deleted,
      });
      expect(await decodeRecord(hdk, sealed)).toEqual(r);
    }
  });

  it("emits envelopes the server's padding check accepts, whatever the content size", async () => {
    const hdk = await hdkFor("hh-1");
    const lengths = new Set<number>();
    for (const name of ["a", "a".repeat(40), "a".repeat(60)]) {
      const { ciphertext } = await encodeRecord(
        hdk,
        record({ data: { name } }),
      );
      const kidLen = ciphertext[1];
      expect(ciphertext[0]).toBe(1);
      expect((ciphertext.length - 30 - kidLen) % PAD_BLOCK).toBe(0);
      lengths.add(ciphertext.length);
    }
    // Small records of different sizes are indistinguishable by length.
    expect(lengths.size).toBe(1);
  });

  it("never puts plaintext in the envelope", async () => {
    const sealed = await encodeRecord(await hdkFor("hh-1"), record());
    const text = new TextDecoder("latin1").decode(sealed.ciphertext);
    for (const leak of ["PPF", "account", ASHA, "2026-10-12"])
      expect(text).not.toContain(leak);
  });

  it("fails closed under another household's key", async () => {
    const sealed = await encodeRecord(await hdkFor("hh-1"), record());
    await rejects(decodeRecord(await hdkFor("hh-2"), sealed));
  });

  it("fails closed when the version or id is swapped", async () => {
    const hdk = await hdkFor("hh-1");
    const sealed = await encodeRecord(hdk, record({ version: 2 }));
    await rejects(decodeRecord(hdk, { ...sealed, version: 3 }));
    await rejects(decodeRecord(hdk, { ...sealed, version: 1 }));
    await rejects(decodeRecord(hdk, { ...sealed, id: OTHER_ID }));
    await rejects(decodeRecord(hdk, { ...sealed, version: 0 }));
    await rejects(decodeRecord(hdk, { ...sealed, id: "a|b" }));
  });

  it("refuses a replay of an older envelope once a newer version is known", async () => {
    const hdk = await hdkFor("hh-1");
    const v1 = await encodeRecord(hdk, record({ version: 1 }));
    const v2 = await encodeRecord(hdk, record({ version: 2 }));
    expect((await decodeRecord(hdk, v2, 1)).version).toBe(2);
    expect((await decodeRecord(hdk, v2, 2)).version).toBe(2);
    await rejects(decodeRecord(hdk, v1, 2));
  });

  it("fails closed when the server flips the plain deleted flag", async () => {
    const hdk = await hdkFor("hh-1");
    const live = await encodeRecord(hdk, record());
    const gone = await encodeRecord(hdk, record({ deleted: true }));
    await rejects(decodeRecord(hdk, { ...live, deleted: true }));
    await rejects(decodeRecord(hdk, { ...gone, deleted: false }));
  });

  it("fails closed on tampering with any envelope byte", async () => {
    const hdk = await hdkFor("hh-1");
    const sealed = await encodeRecord(hdk, record());
    for (const at of [0, 1, 4, 10, 20, sealed.ciphertext.length - 1]) {
      const ciphertext = sealed.ciphertext.slice() as Bytes;
      ciphertext[at] ^= 0x01;
      await rejects(decodeRecord(hdk, { ...sealed, ciphertext }));
    }
    await rejects(
      decodeRecord(hdk, {
        ...sealed,
        ciphertext: sealed.ciphertext.slice(0, 40) as Bytes,
      }),
    );
  });

  it("fails closed on well-sealed bytes that are not a valid record", async () => {
    const hdk = await hdkFor("hh-1");
    const sealRaw = async (
      json: string,
      unpadded = false,
    ): Promise<SealedRecord> => {
      const bytes = new TextEncoder().encode(json);
      const pt = unpadded ? bytes : pad(bytes);
      const ciphertext = await seal(hdk.key, pt, recordAad(ID, 1), hdk.kid);
      return { id: ID, version: 1, deleted: false, ciphertext };
    };
    const good = JSON.parse(
      new TextDecoder().decode(
        unpad(
          await open(
            hdk.key,
            (await encodeRecord(hdk, record())).ciphertext,
            recordAad(ID, 1),
          ),
        ),
      ),
    );
    expect(
      (await decodeRecord(hdk, await sealRaw(JSON.stringify(good)))).type,
    ).toBe("account");
    for (const bad of [
      "not json",
      "[]",
      JSON.stringify({ ...good, f: 2 }),
      JSON.stringify({ ...good, type: "" }),
      JSON.stringify({ ...good, schemaVersion: 0 }),
      JSON.stringify({ ...good, modifiedAt: "2026-10-12" }),
      JSON.stringify({ ...good, modifiedBy: ASHA.toUpperCase() }),
    ])
      await rejects(decodeRecord(hdk, await sealRaw(bad)));
    await rejects(decodeRecord(hdk, await sealRaw(JSON.stringify(good), true)));
  });

  it("keeps the kid, so a rotated key is detectable", async () => {
    const hdk = await hdkFor("hh-1");
    const { kid, iv, ct } = parseEnvelope(
      (await encodeRecord(hdk, record())).ciphertext,
    );
    expect(kid).toBe(FIRST_KID);
    const relabelled = encodeEnvelope("hdk:2", iv, ct);
    await rejects(
      decodeRecord(hdk, {
        ...(await encodeRecord(hdk, record())),
        ciphertext: relabelled,
      }),
    );
  });

  it("refuses to seal invalid content", async () => {
    const hdk = await hdkFor("hh-1");
    await expect(
      encodeRecord(hdk, record({ modifiedAt: "yesterday" })),
    ).rejects.toThrow();
    await expect(
      encodeRecord(hdk, record({ modifiedBy: "asha" })),
    ).rejects.toThrow();
    await expect(encodeRecord(hdk, record({ type: "" }))).rejects.toThrow();
  });
});
