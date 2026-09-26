import { describe, expect, it } from "vitest";
import { DecryptError, open, parseEnvelope, recordAad, seal } from "./aead";
import {
  createHousehold,
  FIRST_KID,
  keyFingerprint,
  unwrapHouseholdKey,
  wrapHouseholdKey,
} from "./household";
import type { Bytes } from "./kdf";
import { exportPublicKey, generateIdentityKeyPair } from "./keys";
import type { UnlockedIdentity } from "./vault";

/** Session-shaped identity without Argon2id: the vault is tested in vault.test.ts. */
async function member(): Promise<UnlockedIdentity & { pub: Bytes }> {
  const pair = await generateIdentityKeyPair();
  return { ...pair, pub: await exportPublicKey(pair.publicKey) };
}

const utf8 = (s: string): Bytes => new TextEncoder().encode(s);
const RECORD = "5f1c2a7e-0000-4000-8000-000000000001";

describe("household data key", () => {
  it("is created with a key id and wrapped to its creator", async () => {
    const a = await member();
    const { household, selfWrap } = await createHousehold(a);
    expect(household.kid).toBe(FIRST_KID);
    const raw = new Uint8Array(
      await crypto.subtle.exportKey("raw", household.key),
    );
    expect(raw).toHaveLength(32);

    const back = await unwrapHouseholdKey(a, household.householdId, selfWrap);
    expect(back.household.kid).toBe(FIRST_KID);
    expect(back.senderPublicKey).toEqual(a.pub);
    expect(
      new Uint8Array(await crypto.subtle.exportKey("raw", back.household.key)),
    ).toEqual(raw);
  });

  it("lets an invited member decrypt a record sealed by the creator", async () => {
    const a = await member();
    const b = await member();
    const { household } = await createHousehold(a);
    const invite = await wrapHouseholdKey(a, household, b.pub);

    const sealed = await seal(
      household.key,
      utf8("SBI savings: 1,20,000"),
      recordAad(RECORD, 1),
      household.kid,
    );
    expect(parseEnvelope(sealed).kid).toBe(FIRST_KID);

    const accepted = await unwrapHouseholdKey(b, household.householdId, invite);
    expect(await keyFingerprint(accepted.senderPublicKey)).toBe(
      await keyFingerprint(a.pub),
    );
    const plain = await open(
      accepted.household.key,
      sealed,
      recordAad(RECORD, 1),
    );
    expect(new TextDecoder().decode(plain)).toBe("SBI savings: 1,20,000");
  });

  it("keeps other households and outsiders out", async () => {
    const a = await member();
    const b = await member();
    const c = await member();
    const { household } = await createHousehold(a);
    const other = await createHousehold(c);
    const invite = await wrapHouseholdKey(a, household, b.pub);
    const sealed = await seal(
      household.key,
      utf8("secret"),
      recordAad(RECORD, 1),
      household.kid,
    );

    // C intercepts B's invite, or relabels it for C's own household.
    await expect(
      unwrapHouseholdKey(c, household.householdId, invite),
    ).rejects.toThrow(DecryptError);
    await expect(
      unwrapHouseholdKey(b, other.household.householdId, invite),
    ).rejects.toThrow(DecryptError);
    // C's own HDK cannot open A's record.
    await expect(
      open(other.household.key, sealed, recordAad(RECORD, 1)),
    ).rejects.toThrow(DecryptError);
  });

  it("rejects a tampered or truncated blob", async () => {
    const a = await member();
    const b = await member();
    const { household } = await createHousehold(a);
    const invite = await wrapHouseholdKey(a, household, b.pub);
    const id = household.householdId;

    for (const at of [0, 1, 70, 83, invite.length - 1]) {
      const bad = invite.slice();
      bad[at] ^= 0x01;
      await expect(unwrapHouseholdKey(b, id, bad)).rejects.toThrow(
        DecryptError,
      );
    }
    await expect(
      unwrapHouseholdKey(b, id, invite.slice(0, -1)),
    ).rejects.toThrow(DecryptError);
    await expect(unwrapHouseholdKey(b, id, new Uint8Array(0))).rejects.toThrow(
      DecryptError,
    );
  });

  it("uses a fresh salt per wrap", async () => {
    const a = await member();
    const b = await member();
    const { household } = await createHousehold(a);
    const one = await wrapHouseholdKey(a, household, b.pub);
    const two = await wrapHouseholdKey(a, household, b.pub);
    expect(one).not.toEqual(two);
  });
});

describe("keyFingerprint", () => {
  it("is stable per key, distinct across keys, 5 groups of 4 hex", async () => {
    const a = await member();
    const b = await member();
    const fa = await keyFingerprint(a.pub);
    expect(fa).toMatch(/^([0-9a-f]{4} ){4}[0-9a-f]{4}$/);
    expect(await keyFingerprint(a.pub)).toBe(fa);
    expect(await keyFingerprint(b.pub)).not.toBe(fa);
  });
});
