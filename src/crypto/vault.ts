/**
 * Identity vault (ADR-0002, ADR-0018): the member's P-256 private key, AES-GCM wrapped twice —
 * under the passphrase unlock key and under the recovery-code key. The vault holds only the
 * public key and ciphertext, so it may be stored in IndexedDB and uploaded as-is.
 */
import { DecryptError, encodeEnvelope, IV_BYTES, parseEnvelope } from "./aead";
import {
  type Bytes,
  deriveUnlockKey,
  type KdfParams,
  randomBytes,
} from "./kdf";
import {
  exportPublicKey,
  generateIdentityKeyPair,
  importPublicKey,
  P256,
} from "./keys";
import { deriveRecoveryKey, generateRecoveryCode } from "./recovery";

type Slot = "passphrase" | "recovery";

export interface IdentityVault {
  v: 1;
  /** Raw SEC1 public key; the HDK is wrapped to this, so it never changes. */
  publicKey: Bytes;
  kdf: KdfParams;
  byPassphrase: Bytes;
  byRecovery: Bytes;
}

/** In-memory only. `privateKey` is non-extractable: it cannot be exported or re-wrapped. */
export interface UnlockedIdentity {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

/** AAD binds each wrap to its slot and to the public key it belongs to. */
function slotAad(slot: Slot, publicKey: Bytes): Bytes {
  const label = new TextEncoder().encode(`nwt/identity/v1|${slot}|`);
  const aad = new Uint8Array(label.length + publicKey.length);
  aad.set(label);
  aad.set(publicKey, label.length);
  return aad;
}

async function wrapPrivateKey(
  key: CryptoKey,
  privateKey: CryptoKey,
  slot: Slot,
  publicKey: Bytes,
): Promise<Bytes> {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(
    await crypto.subtle.wrapKey("pkcs8", privateKey, key, {
      name: "AES-GCM",
      iv,
      additionalData: slotAad(slot, publicKey),
    }),
  );
  return encodeEnvelope(slot, iv, ct);
}

/** Throws `DecryptError` for a wrong key, a swapped slot or any tampering. */
async function unwrapPrivateKey(
  key: CryptoKey,
  sealed: Bytes,
  slot: Slot,
  publicKey: Bytes,
  extractable: boolean,
): Promise<CryptoKey> {
  const { kid, iv, ct } = parseEnvelope(sealed);
  if (kid !== slot) throw new DecryptError();
  try {
    return await crypto.subtle.unwrapKey(
      "pkcs8",
      ct,
      key,
      { name: "AES-GCM", iv, additionalData: slotAad(slot, publicKey) },
      P256,
      extractable,
      ["deriveBits"],
    );
  } catch {
    throw new DecryptError();
  }
}

async function unlocked(
  vault: IdentityVault,
  privateKey: CryptoKey,
): Promise<UnlockedIdentity> {
  return { publicKey: await importPublicKey(vault.publicKey), privateKey };
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
 * anywhere. Runs entirely offline.
 */
export async function createIdentity(passphrase: string): Promise<{
  vault: IdentityVault;
  recoveryCode: string;
  identity: UnlockedIdentity;
}> {
  const pair = await generateIdentityKeyPair();
  const publicKey = await exportPublicKey(pair.publicKey);
  const { key, params } = await deriveUnlockKey(passphrase);
  const recoveryCode = generateRecoveryCode();
  const recoveryKey = await deriveRecoveryKey(recoveryCode);
  const vault: IdentityVault = {
    v: 1,
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
  };
  return {
    vault,
    recoveryCode,
    identity: await unlocked(vault, await sessionKey(vault, key)),
  };
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
