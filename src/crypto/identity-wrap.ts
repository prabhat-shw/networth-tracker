/**
 * AES-GCM wrap of the identity private key (ADR-0018), shared by every vault slot: the
 * passphrase and recovery slots (`vault.ts`) and the passkey slots (`vault-passkey.ts`).
 * The envelope's key id names the slot; the AAD binds the wrap to its slot and public key.
 */
import { DecryptError, encodeEnvelope, IV_BYTES, parseEnvelope } from "./aead";
import { type Bytes, randomBytes } from "./kdf";
import { importPublicKey, P256 } from "./keys";

/** In-memory only. `privateKey` is non-extractable: it cannot be exported or re-wrapped. */
export interface UnlockedIdentity {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export async function wrapPrivateKey(
  key: CryptoKey,
  privateKey: CryptoKey,
  kid: string,
  aad: Bytes,
): Promise<Bytes> {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(
    await crypto.subtle.wrapKey("pkcs8", privateKey, key, {
      name: "AES-GCM",
      iv,
      additionalData: aad,
    }),
  );
  return encodeEnvelope(kid, iv, ct);
}

/** Throws `DecryptError` for a wrong key, a swapped slot or any tampering. */
export async function unwrapPrivateKey(
  key: CryptoKey,
  sealed: Bytes,
  kid: string,
  aad: Bytes,
  extractable: boolean,
): Promise<CryptoKey> {
  const envelope = parseEnvelope(sealed);
  if (envelope.kid !== kid) throw new DecryptError();
  try {
    return await crypto.subtle.unwrapKey(
      "pkcs8",
      envelope.ct,
      key,
      { name: "AES-GCM", iv: envelope.iv, additionalData: aad },
      P256,
      extractable,
      ["deriveBits"],
    );
  } catch {
    throw new DecryptError();
  }
}

export async function unlockedIdentity(
  publicKey: Bytes,
  privateKey: CryptoKey,
): Promise<UnlockedIdentity> {
  return { publicKey: await importPublicKey(publicKey), privateKey };
}
