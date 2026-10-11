import { beforeAll, describe, expect, it, vi } from "vitest";
import { DecryptError } from "./aead";
import { randomBytes } from "./kdf";
import { generateIdentityKeyPair } from "./keys";
import {
  createIdentity,
  restoreWithRecoveryCode,
  unlockWithPassphrase,
} from "./vault";
import {
  addPasskeyFromDevice,
  addPassphraseFromDevice,
  addRecoveryKitFromDevice,
  createDeviceIdentity,
  createDeviceSlot,
  type DeviceSlot,
  openDeviceSlot,
} from "./vault-device";
import {
  newPrfSalt,
  type PasskeyPrf,
  unlockWithPasskey,
} from "./vault-passkey";
import {
  decodeVault,
  encodeVault,
  hasRecoveryMethod,
  PASSKEY_BOUNDS,
  vaultSlots,
} from "./wire";

let made: Awaited<ReturnType<typeof createDeviceIdentity>>;

beforeAll(async () => {
  made = await createDeviceIdentity();
}, 30_000);

const sharedBits = async (priv: CryptoKey, pub: CryptoKey) =>
  Buffer.from(
    await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256),
  ).toString("hex");

/** Proves `identity` holds the private key of `made`'s public key. */
async function opensMade(privateKey: CryptoKey) {
  const peer = await generateIdentityKeyPair();
  expect(await sharedBits(privateKey, peer.publicKey)).toBe(
    await sharedBits(peer.privateKey, made.identity.publicKey),
  );
}

const reload = <T extends Parameters<typeof encodeVault>[0]>(v: T) =>
  decodeVault(JSON.parse(JSON.stringify(encodeVault(v))));

describe("device identity (first run with nothing asked)", () => {
  it("starts with no slots in the vault and no recovery method", () => {
    expect(vaultSlots(made.vault)).toEqual({
      passphrase: false,
      recovery: false,
      passkeys: 0,
    });
    expect(hasRecoveryMethod(vaultSlots(made.vault))).toBe(false);
    expect(encodeVault(made.vault)).toEqual({
      v: 3,
      publicKey: expect.any(String),
    });
  });

  it("opens with the device slot into a non-extractable session key", async () => {
    const identity = await openDeviceSlot(reload(made.vault), made.device);
    expect(identity.privateKey.extractable).toBe(false);
    await opensMade(identity.privateKey);
  });

  it("keeps the device key non-extractable", async () => {
    expect(made.device.key.extractable).toBe(false);
    expect(made.device.key.usages.sort()).toEqual(["unwrapKey", "wrapKey"]);
    await expect(
      crypto.subtle.exportKey("raw", made.device.key),
    ).rejects.toThrow();
  });

  it("holds only the key, the public key and wrapped bytes", async () => {
    expect(Object.keys(made.device).sort()).toEqual([
      "key",
      "publicKey",
      "wrap",
    ]);
    // The private scalar never appears in what the device stores.
    const pair = await generateIdentityKeyPair();
    const slot = await createDeviceSlot(
      new Uint8Array(65).fill(4),
      pair.privateKey,
    );
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const d = Buffer.from(jwk.d ?? "", "base64url").toString("hex");
    expect(d).toHaveLength(64);
    expect(Buffer.from(slot.wrap).toString("hex")).not.toContain(d);
  });
});

describe("device slot fails closed", () => {
  it("rejects another identity's vault", async () => {
    const other = await createDeviceIdentity();
    await expect(openDeviceSlot(other.vault, made.device)).rejects.toThrow(
      DecryptError,
    );
    const swapped: DeviceSlot = { ...made.device, key: other.device.key };
    await expect(openDeviceSlot(made.vault, swapped)).rejects.toThrow(
      DecryptError,
    );
  });

  it("rejects a tampered wrap or a wrap claimed for another public key", async () => {
    const wrap = made.device.wrap.slice();
    wrap[wrap.length - 1] ^= 1;
    await expect(
      openDeviceSlot(made.vault, { ...made.device, wrap }),
    ).rejects.toThrow(DecryptError);
    const other = await createDeviceIdentity();
    await expect(
      openDeviceSlot(other.vault, {
        ...made.device,
        publicKey: other.vault.publicKey,
      }),
    ).rejects.toThrow(DecryptError);
  });

  it("refuses an extractable device key", async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["wrapKey", "unwrapKey"],
    );
    await expect(
      addRecoveryKitFromDevice(made.vault, { ...made.device, key }),
    ).rejects.toThrow(DecryptError);
  });
});

describe("adding a recovery method from the device slot alone", () => {
  it("adds a passphrase that unlocks on a fresh profile", async () => {
    const vault = reload(
      await addPassphraseFromDevice(made.vault, made.device, "pass one"),
    );
    expect(vaultSlots(vault)).toMatchObject({ passphrase: true });
    expect(encodeVault(vault).v).toBe(3);
    await opensMade((await unlockWithPassphrase(vault, "pass one")).privateKey);
    await expect(unlockWithPassphrase(vault, "nope")).rejects.toThrow(
      DecryptError,
    );
  });

  it("issues a kit that restores on a fresh profile", async () => {
    const { vault, recoveryCode } = await addRecoveryKitFromDevice(
      made.vault,
      made.device,
    );
    expect(vaultSlots(vault)).toMatchObject({ recovery: true });
    const restored = await restoreWithRecoveryCode(
      reload(vault),
      recoveryCode,
      "new pass",
    );
    await opensMade(restored.identity.privateKey);
    // Kit + passphrase is the full v1 shape again.
    expect(encodeVault(restored.vault).v).toBe(1);
  });

  it("adds a passkey that unlocks on a fresh profile", async () => {
    const prf: PasskeyPrf = {
      credentialId: randomBytes(32),
      prfSalt: newPrfSalt(),
      prfOutput: randomBytes(PASSKEY_BOUNDS.prfOutputBytes),
    };
    const vault = reload(
      await addPasskeyFromDevice(made.vault, made.device, prf),
    );
    expect(encodeVault(vault).v).toBe(3);
    expect(hasRecoveryMethod(vaultSlots(vault))).toBe(true);
    await opensMade((await unlockWithPasskey(vault, prf)).privateKey);
  });

  it("asks for nothing and touches no network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await addRecoveryKitFromDevice(made.vault, made.device);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("missing slots fail closed", () => {
  it("passphrase and recovery calls on a slotless vault throw DecryptError", async () => {
    await expect(unlockWithPassphrase(made.vault, "x")).rejects.toThrow(
      DecryptError,
    );
    await expect(
      restoreWithRecoveryCode(
        made.vault,
        (await createIdentity("p")).recoveryCode,
        "x",
      ),
    ).rejects.toThrow(DecryptError);
  });
});
