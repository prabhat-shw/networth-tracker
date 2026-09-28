import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DecryptError } from "./aead";
import { type Bytes, randomBytes } from "./kdf";
import {
  addPasskeySlot,
  changePassphrase,
  createIdentity,
  type IdentityVault,
  restoreWithRecoveryCode,
  unlockWithPassphrase,
} from "./vault";
import {
  newPrfSalt,
  type PasskeyPrf,
  PasskeySlotLimitError,
  removePasskeySlot,
  unlockWithPasskey,
} from "./vault-passkey";
import { decodeVault, encodeVault, PASSKEY_BOUNDS } from "./wire";

const PASS = "correct horse battery staple";

/** Stands in for an authenticator: a fixed PRF output per credential. */
const passkey = (): PasskeyPrf => ({
  credentialId: randomBytes(32),
  prfSalt: newPrfSalt(),
  prfOutput: randomBytes(PASSKEY_BOUNDS.prfOutputBytes),
});

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64url");

/** Proves two identities hold the same private key via an ECDH agreement. */
async function samePrivateKey(a: CryptoKey, b: CryptoKey) {
  const peer = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const bits = async (k: CryptoKey) =>
    b64(
      new Uint8Array(
        await crypto.subtle.deriveBits(
          { name: "ECDH", public: peer.publicKey },
          k,
          256,
        ),
      ),
    );
  return (await bits(a)) === (await bits(b));
}

let created: Awaited<ReturnType<typeof createIdentity>>;
let phone: PasskeyPrf;
let withPhone: IdentityVault;

beforeAll(async () => {
  created = await createIdentity(PASS);
  phone = passkey();
  withPhone = await created.enrolPasskey(created.vault, phone);
}, 30_000);

afterEach(() => vi.unstubAllGlobals());

describe("passkey slots", () => {
  it("unlocks with the passkey after first-run enrolment, non-extractable", async () => {
    const back = decodeVault(
      JSON.parse(JSON.stringify(encodeVault(withPhone))),
    );
    const identity = await unlockWithPasskey(back, phone);
    expect(identity.privateKey.extractable).toBe(false);
    expect(
      await samePrivateKey(identity.privateKey, created.identity.privateKey),
    ).toBe(true);
    // Passphrase and recovery slots are unchanged.
    expect(withPhone.byPassphrase).toEqual(created.vault.byPassphrase);
    expect(withPhone.byRecovery).toEqual(created.vault.byRecovery);
    await expect(unlockWithPassphrase(withPhone, PASS)).resolves.toBeDefined();
  });

  it("fails closed on a wrong PRF output, salt or credential", async () => {
    const cases: PasskeyPrf[] = [
      { ...phone, prfOutput: randomBytes(32) },
      { ...phone, prfSalt: newPrfSalt() },
      { ...phone, credentialId: randomBytes(32) },
      { ...phone, prfOutput: phone.prfOutput.slice(0, 16) as Bytes },
      passkey(),
    ];
    for (const prf of cases)
      await expect(unlockWithPasskey(withPhone, prf)).rejects.toThrow(
        DecryptError,
      );
  });

  it("fails closed when a wrap is moved to another credential or vault", async () => {
    const [slot] = withPhone.passkeys;
    const moved: IdentityVault = {
      ...withPhone,
      passkeys: [{ ...slot, credentialId: randomBytes(32) }],
    };
    await expect(
      unlockWithPasskey(moved, {
        ...phone,
        credentialId: moved.passkeys[0].credentialId,
      }),
    ).rejects.toThrow(DecryptError);

    const other = await createIdentity(PASS);
    await expect(
      unlockWithPasskey(
        { ...withPhone, publicKey: other.vault.publicKey },
        phone,
      ),
    ).rejects.toThrow(DecryptError);
    await expect(
      unlockWithPasskey(
        { ...withPhone, passkeys: [{ ...slot, wrap: withPhone.byPassphrase }] },
        phone,
      ),
    ).rejects.toThrow(DecryptError);
  });

  it("adds a slot after a passphrase unlock, and needs the right passphrase", async () => {
    const laptop = passkey();
    const next = await addPasskeySlot(withPhone, PASS, laptop);
    expect(next.passkeys).toHaveLength(2);
    await expect(unlockWithPasskey(next, laptop)).resolves.toBeDefined();
    await expect(unlockWithPasskey(next, phone)).resolves.toBeDefined();
    await expect(addPasskeySlot(withPhone, "wrong", laptop)).rejects.toThrow(
      DecryptError,
    );
  });

  it("replaces the slot for a re-enrolled credential and caps the count", async () => {
    const again = {
      ...phone,
      prfSalt: newPrfSalt(),
      prfOutput: randomBytes(32),
    };
    const replaced = await created.enrolPasskey(withPhone, again);
    expect(replaced.passkeys).toHaveLength(1);
    await expect(unlockWithPasskey(replaced, again)).resolves.toBeDefined();
    await expect(unlockWithPasskey(replaced, phone)).rejects.toThrow(
      DecryptError,
    );

    let full = withPhone;
    while (full.passkeys.length < PASSKEY_BOUNDS.maxSlots)
      full = await created.enrolPasskey(full, passkey());
    await expect(created.enrolPasskey(full, passkey())).rejects.toThrow(
      PasskeySlotLimitError,
    );
    expect(decodeVault(encodeVault(full)).passkeys).toHaveLength(
      PASSKEY_BOUNDS.maxSlots,
    );
  });

  it("removes a slot so that passkey stops working", async () => {
    const removed = removePasskeySlot(withPhone, phone.credentialId);
    expect(removed.passkeys).toEqual([]);
    await expect(unlockWithPasskey(removed, phone)).rejects.toThrow(
      DecryptError,
    );
    expect(encodeVault(removed).v).toBe(1);
  });

  it("keeps passkey slots through a passphrase change and a recovery restore", async () => {
    const changed = await changePassphrase(withPhone, PASS, "p2");
    await expect(unlockWithPasskey(changed, phone)).resolves.toBeDefined();
    const restored = await restoreWithRecoveryCode(
      changed,
      created.recoveryCode,
      "p3",
    );
    await expect(
      unlockWithPasskey(restored.vault, phone),
    ).resolves.toBeDefined();
  });

  it("refuses to enrol into another identity's vault", async () => {
    const other = await createIdentity(PASS);
    await expect(
      created.enrolPasskey(other.vault, passkey()),
    ).rejects.toThrow();
  });

  it("rejects malformed enrolment input", async () => {
    for (const bad of [
      { ...passkey(), credentialId: randomBytes(8) },
      { ...passkey(), prfSalt: randomBytes(16) },
      { ...passkey(), prfOutput: randomBytes(64) },
    ])
      await expect(created.enrolPasskey(withPhone, bad)).rejects.toThrow(
        RangeError,
      );
  });

  it("never puts the PRF output in the vault or on the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const prf = passkey();
    const vault = await addPasskeySlot(created.vault, PASS, prf);
    await unlockWithPasskey(vault, prf);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(encodeVault(vault))).not.toContain(
      b64(prf.prfOutput),
    );
  });
});
