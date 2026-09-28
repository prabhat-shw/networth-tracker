/**
 * Passkey slots of the identity vault (ADR-0033). Each slot wraps the private key under a key
 * derived from one passkey's WebAuthn PRF output. The PRF output is a secret only that
 * authenticator can reproduce for this credential and salt; it is never stored or sent.
 * The slot holds only public values (credential id, PRF salt) and the wrap.
 */
import { DecryptError } from "./aead";
import {
  type UnlockedIdentity,
  unlockedIdentity,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "./identity-wrap";
import { type Bytes, randomBytes } from "./kdf";
import { hkdf } from "./keys";
import type { IdentityVault } from "./vault";
import { PASSKEY_BOUNDS, sameBytes } from "./wire";

export interface PasskeySlot {
  /** WebAuthn credential id (public): tells the unlock screen which passkey to ask for. */
  credentialId: Bytes;
  /** The PRF input for this slot (public, random per slot). */
  prfSalt: Bytes;
  wrap: Bytes;
}

/** What the unlock or enrolment ceremony hands back: the credential and its PRF result. */
export interface PasskeyPrf {
  credentialId: Bytes;
  prfSalt: Bytes;
  prfOutput: Bytes;
}

export class PasskeySlotLimitError extends Error {
  constructor() {
    super(`at most ${PASSKEY_BOUNDS.maxSlots} passkeys can unlock a vault`);
    this.name = "PasskeySlotLimitError";
  }
}

const KID = "passkey";
const LABEL = new TextEncoder().encode("nwt/identity/v2|passkey|");

/** A fresh PRF input for a new slot; pass it to the WebAuthn PRF extension. */
export function newPrfSalt(): Bytes {
  return randomBytes(PASSKEY_BOUNDS.prfSaltBytes);
}

/** LABEL | u16 credential-id length | credential id | public key. */
function passkeyAad(credentialId: Bytes, publicKey: Bytes): Bytes {
  const out = new Uint8Array(
    LABEL.length + 2 + credentialId.length + publicKey.length,
  );
  out.set(LABEL);
  out[LABEL.length] = credentialId.length >> 8;
  out[LABEL.length + 1] = credentialId.length & 0xff;
  out.set(credentialId, LABEL.length + 2);
  out.set(publicKey, LABEL.length + 2 + credentialId.length);
  return out;
}

function checkPrf({ credentialId, prfSalt, prfOutput }: PasskeyPrf) {
  const { min, max } = PASSKEY_BOUNDS.credentialIdBytes;
  if (credentialId.length < min || credentialId.length > max)
    throw new RangeError("invalid credential id");
  if (prfSalt.length !== PASSKEY_BOUNDS.prfSaltBytes)
    throw new RangeError("invalid PRF salt");
  if (prfOutput.length !== PASSKEY_BOUNDS.prfOutputBytes)
    throw new RangeError("invalid PRF output");
}

/** Non-extractable AES-256-GCM key from the PRF output, bound to the credential. */
async function slotKey(prf: PasskeyPrf): Promise<CryptoKey> {
  const info = new Uint8Array(LABEL.length + prf.credentialId.length);
  info.set(LABEL);
  info.set(prf.credentialId, LABEL.length);
  const okm = await hkdf(prf.prfOutput, prf.prfSalt, info, 32);
  try {
    return await crypto.subtle.importKey("raw", okm, "AES-GCM", false, [
      "wrapKey",
      "unwrapKey",
    ]);
  } finally {
    okm.fill(0);
  }
}

/**
 * Adds (or replaces, for the same credential) a passkey slot. `privateKey` must be the
 * extractable key from a passphrase unwrap or a just-created identity — see `vault.ts`.
 */
export async function withPasskeySlot(
  vault: IdentityVault,
  privateKey: CryptoKey,
  prf: PasskeyPrf,
): Promise<IdentityVault> {
  checkPrf(prf);
  const others = vault.passkeys.filter(
    (s) => !sameBytes(s.credentialId, prf.credentialId),
  );
  if (others.length >= PASSKEY_BOUNDS.maxSlots)
    throw new PasskeySlotLimitError();
  const wrap = await wrapPrivateKey(
    await slotKey(prf),
    privateKey,
    KID,
    passkeyAad(prf.credentialId, vault.publicKey),
  );
  const slot: PasskeySlot = {
    credentialId: prf.credentialId.slice(),
    prfSalt: prf.prfSalt.slice(),
    wrap,
  };
  return { ...vault, passkeys: [...others, slot] };
}

/** Stops a passkey unlocking this vault. The passphrase and recovery slots are untouched. */
export function removePasskeySlot(
  vault: IdentityVault,
  credentialId: Bytes,
): IdentityVault {
  return {
    ...vault,
    passkeys: vault.passkeys.filter(
      (s) => !sameBytes(s.credentialId, credentialId),
    ),
  };
}

/**
 * Throws `DecryptError` for an unknown credential, a wrong PRF output, a salt that does not
 * match the slot, or any tampering; never yields a usable key.
 */
export async function unlockWithPasskey(
  vault: IdentityVault,
  prf: PasskeyPrf,
): Promise<UnlockedIdentity> {
  try {
    checkPrf(prf);
  } catch {
    throw new DecryptError();
  }
  const slot = vault.passkeys.find((s) =>
    sameBytes(s.credentialId, prf.credentialId),
  );
  if (!slot || !sameBytes(slot.prfSalt, prf.prfSalt)) throw new DecryptError();
  const privateKey = await unwrapPrivateKey(
    await slotKey(prf),
    slot.wrap,
    KID,
    passkeyAad(slot.credentialId, vault.publicKey),
    false,
  );
  return unlockedIdentity(vault.publicKey, privateKey);
}
