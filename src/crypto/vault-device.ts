/**
 * Device slot (ADR-0037, ADR-0038): the identity private key wrapped under a non-extractable
 * AES-256-GCM *device key* that lives only in this browser's storage. It opens the app with
 * no passphrase, and, because the wrap can be opened as an extractable key, it can add any
 * recovery slot (passphrase, kit, passkey) without asking for anything else. The device
 * slot is never part of the vault and never uploaded; the server cannot see it exists.
 *
 * Storage is behind `DeviceSlotStore` so this module stays pure; the IndexedDB adapter is
 * `src/features/lock/device-store.ts`.
 */
import { DecryptError } from "./aead";
import {
  type UnlockedIdentity,
  unlockedIdentity,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "./identity-wrap";
import type { Bytes } from "./kdf";
import { exportPublicKey, generateIdentityKeyPair } from "./keys";
import {
  type IdentityVault,
  withPassphraseSlot,
  withRecoverySlot,
} from "./vault";
import { type PasskeyPrf, withPasskeySlot } from "./vault-passkey";
import { sameBytes } from "./wire";

/** Everything the device keeps: a key that cannot be exported, and wrapped bytes. */
export interface DeviceSlot {
  /** Non-extractable AES-GCM; usable only for `wrapKey`/`unwrapKey`. */
  key: CryptoKey;
  /** The identity this slot opens; matched against the vault before use. */
  publicKey: Bytes;
  wrap: Bytes;
}

export interface DeviceSlotStore {
  load(): Promise<DeviceSlot | null>;
  save(slot: DeviceSlot): Promise<void>;
  /** Forgets the device key: the wrap becomes unreadable for good. */
  clear(): Promise<void>;
}

const KID = "device";
const LABEL = new TextEncoder().encode("nwt/identity/v3|device|");

function deviceAad(publicKey: Bytes): Bytes {
  const aad = new Uint8Array(LABEL.length + publicKey.length);
  aad.set(LABEL);
  aad.set(publicKey, LABEL.length);
  return aad;
}

function newDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "wrapKey",
    "unwrapKey",
  ]);
}

/** Wraps an extractable private key under a fresh device key. */
export async function createDeviceSlot(
  publicKey: Bytes,
  privateKey: CryptoKey,
): Promise<DeviceSlot> {
  const key = await newDeviceKey();
  const wrap = await wrapPrivateKey(key, privateKey, KID, deviceAad(publicKey));
  return { key, publicKey: publicKey.slice(), wrap };
}

/**
 * First run with nothing asked (ADR-0037): a new identity whose vault has no slots yet, and
 * the device slot that opens it. The caller saves the slot, uploads the vault, and must add
 * a recovery slot before the first data or invite (#90).
 */
export async function createDeviceIdentity(): Promise<{
  vault: IdentityVault;
  device: DeviceSlot;
  identity: UnlockedIdentity;
}> {
  const pair = await generateIdentityKeyPair();
  const publicKey = await exportPublicKey(pair.publicKey);
  const vault: IdentityVault = {
    v: 3,
    publicKey,
    kdf: null,
    byPassphrase: null,
    byRecovery: null,
    passkeys: [],
  };
  const device = await createDeviceSlot(publicKey, pair.privateKey);
  return { vault, device, identity: await openDeviceSlot(vault, device) };
}

/** Throws `DecryptError` for another identity's slot, an extractable key or tampering. */
function devicePrivateKey(
  vault: IdentityVault,
  device: DeviceSlot,
  extractable: boolean,
): Promise<CryptoKey> {
  if (device.key.extractable || !sameBytes(device.publicKey, vault.publicKey))
    return Promise.reject(new DecryptError());
  return unwrapPrivateKey(
    device.key,
    device.wrap,
    KID,
    deviceAad(vault.publicKey),
    extractable,
  );
}

/** Opens the identity for the session; its private key is non-extractable. */
export async function openDeviceSlot(
  vault: IdentityVault,
  device: DeviceSlot,
): Promise<UnlockedIdentity> {
  return unlockedIdentity(
    vault.publicKey,
    await devicePrivateKey(vault, device, false),
  );
}

/** Adds (or replaces) the passphrase slot from the device slot alone. */
export async function addPassphraseFromDevice(
  vault: IdentityVault,
  device: DeviceSlot,
  passphrase: string,
): Promise<IdentityVault> {
  return withPassphraseSlot(
    vault,
    await devicePrivateKey(vault, device, true),
    passphrase,
  );
}

/** Issues a recovery kit from the device slot alone; the code is returned once. */
export async function addRecoveryKitFromDevice(
  vault: IdentityVault,
  device: DeviceSlot,
): Promise<{ vault: IdentityVault; recoveryCode: string }> {
  return withRecoverySlot(vault, await devicePrivateKey(vault, device, true));
}

/** Adds (or replaces) a passkey slot from the device slot alone. */
export async function addPasskeyFromDevice(
  vault: IdentityVault,
  device: DeviceSlot,
  prf: PasskeyPrf,
): Promise<IdentityVault> {
  return withPasskeySlot(
    vault,
    await devicePrivateKey(vault, device, true),
    prf,
  );
}
