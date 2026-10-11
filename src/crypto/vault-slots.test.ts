// App lock and slot removal (ADR-0043): a device slot rebuilt from the passphrase or a
// passkey, and removing vault slots without ever dropping the last recovery method.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DecryptError } from "./aead";
import { randomBytes } from "./kdf";
import { generateIdentityKeyPair } from "./keys";
import {
  type IdentityVault,
  removePassphraseSlot,
  removeRecoverySlot,
  restoreWithRecoveryCode,
  unlockWithPassphrase,
} from "./vault";
import {
  addPasskeyFromDevice,
  addPassphraseFromDevice,
  addRecoveryKitFromDevice,
  createDeviceIdentity,
  deviceSlotByPasskey,
  deviceSlotByPassphrase,
  openDeviceSlot,
} from "./vault-device";
import {
  newPrfSalt,
  type PasskeyPrf,
  removePasskeySlot,
  unlockWithPasskey,
} from "./vault-passkey";
import {
  decodeVault,
  encodeVault,
  LastRecoveryMethodError,
  PASSKEY_BOUNDS,
  vaultSlots,
} from "./wire";

const PASS = "pass one";
const prf = (): PasskeyPrf => ({
  credentialId: randomBytes(32),
  prfSalt: newPrfSalt(),
  prfOutput: randomBytes(PASSKEY_BOUNDS.prfOutputBytes),
});
const reload = (v: IdentityVault) =>
  decodeVault(JSON.parse(JSON.stringify(encodeVault(v))));

let made: Awaited<ReturnType<typeof createDeviceIdentity>>;
let phone: PasskeyPrf;
let recoveryCode: string;
/** Passphrase + kit + one passkey, as uploaded. */
let full: IdentityVault;

beforeAll(async () => {
  made = await createDeviceIdentity();
  phone = prf();
  let v = await addPassphraseFromDevice(made.vault, made.device, PASS);
  const kit = await addRecoveryKitFromDevice(v, made.device);
  recoveryCode = kit.recoveryCode;
  v = await addPasskeyFromDevice(kit.vault, made.device, phone);
  full = reload(v);
}, 30_000);

/** Proves `privateKey` is `made`'s identity key via an ECDH agreement. */
async function opensMade(privateKey: CryptoKey) {
  const peer = await generateIdentityKeyPair();
  const bits = async (priv: CryptoKey, pub: CryptoKey) =>
    Buffer.from(
      await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256),
    ).toString("hex");
  expect(await bits(privateKey, peer.publicKey)).toBe(
    await bits(peer.privateKey, made.identity.publicKey),
  );
}

describe("app lock off: a device slot from the passphrase or a passkey", () => {
  it("builds a new non-extractable slot from the passphrase", async () => {
    const slot = await deviceSlotByPassphrase(full, PASS);
    expect(slot.key.extractable).toBe(false);
    expect(Buffer.from(slot.wrap)).not.toEqual(Buffer.from(made.device.wrap));
    const identity = await openDeviceSlot(full, slot);
    expect(identity.privateKey.extractable).toBe(false);
    await opensMade(identity.privateKey);
  });

  it("builds one from a passkey", async () => {
    const identity = await openDeviceSlot(
      full,
      await deviceSlotByPasskey(full, phone),
    );
    await opensMade(identity.privateKey);
  });

  it("fails closed on a wrong passphrase, an unknown passkey or a missing slot", async () => {
    await expect(deviceSlotByPassphrase(full, "nope")).rejects.toThrow(
      DecryptError,
    );
    await expect(deviceSlotByPasskey(full, prf())).rejects.toThrow(
      DecryptError,
    );
    await expect(
      deviceSlotByPasskey(full, { ...phone, prfOutput: prf().prfOutput }),
    ).rejects.toThrow(DecryptError);
    await expect(deviceSlotByPassphrase(made.vault, PASS)).rejects.toThrow(
      DecryptError,
    );
  });

  it("touches no network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await deviceSlotByPassphrase(full, PASS);
      await deviceSlotByPasskey(full, phone);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("removing slots", () => {
  it("removes each slot so it stops working, and the rest still open", async () => {
    const noPass = reload(removePassphraseSlot(full));
    expect(vaultSlots(noPass)).toEqual({
      passphrase: false,
      recovery: true,
      passkeys: 1,
    });
    expect(noPass.kdf).toBeNull();
    await expect(unlockWithPassphrase(noPass, PASS)).rejects.toThrow(
      DecryptError,
    );
    await opensMade((await unlockWithPasskey(noPass, phone)).privateKey);

    const noKit = reload(removeRecoverySlot(full));
    await expect(
      restoreWithRecoveryCode(noKit, recoveryCode, "x"),
    ).rejects.toThrow(DecryptError);
    await opensMade((await unlockWithPassphrase(noKit, PASS)).privateKey);

    const noPasskey = reload(removePasskeySlot(full, phone.credentialId));
    await expect(unlockWithPasskey(noPasskey, phone)).rejects.toThrow(
      DecryptError,
    );
    expect(encodeVault(noPasskey).v).toBe(1);
  });

  it("refuses to drop the last recovery method, whichever it is", () => {
    const onlyPasskey = removeRecoverySlot(removePassphraseSlot(full));
    expect(() => removePasskeySlot(onlyPasskey, phone.credentialId)).toThrow(
      LastRecoveryMethodError,
    );
    const onlyKit = removePasskeySlot(
      removePassphraseSlot(full),
      phone.credentialId,
    );
    expect(() => removeRecoverySlot(onlyKit)).toThrow(LastRecoveryMethodError);
    const onlyPass = removePasskeySlot(
      removeRecoverySlot(full),
      phone.credentialId,
    );
    expect(() => removePassphraseSlot(onlyPass)).toThrow(
      LastRecoveryMethodError,
    );
  });

  it("removing a passkey that isn't there leaves the vault as it was", () => {
    expect(vaultSlots(removePasskeySlot(full, randomBytes(32)))).toEqual(
      vaultSlots(full),
    );
  });
});
