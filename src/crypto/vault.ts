/**
 * Identity vault (ADR-0002, ADR-0018): the member's P-256 private key, AES-GCM wrapped
 * under the passphrase unlock key, the recovery-code key and, optionally, one key per
 * passkey (ADR-0033, `vault-passkey.ts`). The vault holds only the public key, public slot
 * metadata and ciphertext, so it may be stored in IndexedDB and uploaded as-is.
 */
import {
  type UnlockedIdentity,
  unlockedIdentity,
  unwrapPrivateKey as unwrap,
  wrapPrivateKey as wrap,
} from "./identity-wrap";
import { type Bytes, deriveUnlockKey, type KdfParams } from "./kdf";
import { exportPublicKey, generateIdentityKeyPair } from "./keys";
import { deriveRecoveryKey, generateRecoveryCode } from "./recovery";
import {
  type PasskeyPrf,
  type PasskeySlot,
  withPasskeySlot,
} from "./vault-passkey";

export type { UnlockedIdentity } from "./identity-wrap";

type Slot = "passphrase" | "recovery";

export interface IdentityVault {
  /** In-memory model version; the wire form stays v1 while `passkeys` is empty. */
  v: 2;
  /** Raw SEC1 public key; the HDK is wrapped to this, so it never changes. */
  publicKey: Bytes;
  kdf: KdfParams;
  byPassphrase: Bytes;
  byRecovery: Bytes;
  passkeys: PasskeySlot[];
}

/** AAD binds each wrap to its slot and to the public key it belongs to. */
function slotAad(slot: Slot, publicKey: Bytes): Bytes {
  const label = new TextEncoder().encode(`nwt/identity/v1|${slot}|`);
  const aad = new Uint8Array(label.length + publicKey.length);
  aad.set(label);
  aad.set(publicKey, label.length);
  return aad;
}

function wrapPrivateKey(
  key: CryptoKey,
  privateKey: CryptoKey,
  slot: Slot,
  publicKey: Bytes,
): Promise<Bytes> {
  return wrap(key, privateKey, slot, slotAad(slot, publicKey));
}

/** Throws `DecryptError` for a wrong key, a swapped slot or any tampering. */
function unwrapPrivateKey(
  key: CryptoKey,
  sealed: Bytes,
  slot: Slot,
  publicKey: Bytes,
  extractable: boolean,
): Promise<CryptoKey> {
  return unwrap(key, sealed, slot, slotAad(slot, publicKey), extractable);
}

function unlocked(
  vault: IdentityVault,
  privateKey: CryptoKey,
): Promise<UnlockedIdentity> {
  return unlockedIdentity(vault.publicKey, privateKey);
}

/** Re-imports an extractable private key as a non-extractable one for the session. */
async function sessionKey(
  vault: IdentityVault,
  unlockKey: CryptoKey,
): Promise<CryptoKey> {
  return unwrapPrivateKey(
    unlockKey,
    vault.byPassphrase,
    "passphrase",
    vault.publicKey,
    false,
  );
}

/**
 * New identity. The recovery code is returned once for the user to print; it is not kept
 * anywhere. Runs entirely offline. `enrolPasskey` adds a passkey slot during first run
 * without asking for the passphrase again; drop it when first run ends, since it keeps the
 * extractable private key reachable.
 */
export async function createIdentity(passphrase: string): Promise<{
  vault: IdentityVault;
  recoveryCode: string;
  identity: UnlockedIdentity;
  enrolPasskey: (
    vault: IdentityVault,
    prf: PasskeyPrf,
  ) => Promise<IdentityVault>;
}> {
  const pair = await generateIdentityKeyPair();
  const publicKey = await exportPublicKey(pair.publicKey);
  const { key, params } = await deriveUnlockKey(passphrase);
  const recoveryCode = generateRecoveryCode();
  const recoveryKey = await deriveRecoveryKey(recoveryCode);
  const vault: IdentityVault = {
    v: 2,
    publicKey,
    kdf: params,
    byPassphrase: await wrapPrivateKey(
      key,
      pair.privateKey,
      "passphrase",
      publicKey,
    ),
    byRecovery: await wrapPrivateKey(
      recoveryKey,
      pair.privateKey,
      "recovery",
      publicKey,
    ),
    passkeys: [],
  };
  const privateKey = pair.privateKey;
  return {
    vault,
    recoveryCode,
    identity: await unlocked(vault, await sessionKey(vault, key)),
    enrolPasskey: (current, prf) => {
      if (current.publicKey.join() !== publicKey.join())
        return Promise.reject(new Error("not this identity's vault"));
      return withPasskeySlot(current, privateKey, prf);
    },
  };
}

/**
 * Adds a passkey slot (ADR-0033). The session key is non-extractable, so this needs the
 * passphrase: call it right after a passphrase unlock. Throws `DecryptError` on a wrong one.
 */
export async function addPasskeySlot(
  vault: IdentityVault,
  passphrase: string,
  prf: PasskeyPrf,
): Promise<IdentityVault> {
  const { key } = await deriveUnlockKey(passphrase, vault.kdf);
  const privateKey = await unwrapPrivateKey(
    key,
    vault.byPassphrase,
    "passphrase",
    vault.publicKey,
    true,
  );
  return withPasskeySlot(vault, privateKey, prf);
}

/** Throws `DecryptError` on a wrong passphrase; never yields a usable key. */
export async function unlockWithPassphrase(
  vault: IdentityVault,
  passphrase: string,
): Promise<UnlockedIdentity> {
  const { key } = await deriveUnlockKey(passphrase, vault.kdf);
  return unlocked(vault, await sessionKey(vault, key));
}

/**
 * Re-wraps the private key under a new passphrase (fresh salt, current KDF defaults).
 * The keypair, the recovery wrap and therefore every HDK wrap stay untouched.
 */
export async function changePassphrase(
  vault: IdentityVault,
  oldPassphrase: string,
  newPassphrase: string,
): Promise<IdentityVault> {
  const { key: oldKey } = await deriveUnlockKey(oldPassphrase, vault.kdf);
  const privateKey = await unwrapPrivateKey(
    oldKey,
    vault.byPassphrase,
    "passphrase",
    vault.publicKey,
    true,
  );
  return rewrapPassphrase(vault, privateKey, newPassphrase);
}

async function rewrapPassphrase(
  vault: IdentityVault,
  privateKey: CryptoKey,
  passphrase: string,
): Promise<IdentityVault> {
  const { key, params } = await deriveUnlockKey(passphrase);
  return {
    ...vault,
    kdf: params,
    byPassphrase: await wrapPrivateKey(
      key,
      privateKey,
      "passphrase",
      vault.publicKey,
    ),
  };
}

/**
 * Forgotten passphrase: the recovery code unwraps the private key, which is re-wrapped under
 * a new passphrase. Needs only the stored vault, so it works on a fresh browser profile.
 */
export async function restoreWithRecoveryCode(
  vault: IdentityVault,
  recoveryCode: string,
  newPassphrase: string,
): Promise<{ vault: IdentityVault; identity: UnlockedIdentity }> {
  const recoveryKey = await deriveRecoveryKey(recoveryCode);
  const privateKey = await unwrapPrivateKey(
    recoveryKey,
    vault.byRecovery,
    "recovery",
    vault.publicKey,
    true,
  );
  const next = await rewrapPassphrase(vault, privateKey, newPassphrase);
  return {
    vault: next,
    identity: await unlockWithPassphrase(next, newPassphrase),
  };
}

/** Lost or exposed kit: issue a new code; the old one stops working. */
export async function rotateRecoveryCode(
  vault: IdentityVault,
  passphrase: string,
): Promise<{ vault: IdentityVault; recoveryCode: string }> {
  const { key } = await deriveUnlockKey(passphrase, vault.kdf);
  const privateKey = await unwrapPrivateKey(
    key,
    vault.byPassphrase,
    "passphrase",
    vault.publicKey,
    true,
  );
  const recoveryCode = generateRecoveryCode();
  const byRecovery = await wrapPrivateKey(
    await deriveRecoveryKey(recoveryCode),
    privateKey,
    "recovery",
    vault.publicKey,
  );
  return { vault: { ...vault, byRecovery }, recoveryCode };
}
