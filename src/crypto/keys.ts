/**
 * Asymmetric + key-wrapping primitives (ADR-0002): the HDK is wrapped per member via
 * ECDH(P-256) -> HKDF-SHA-256 -> AES-KW.
 */
import type { Bytes } from "./kdf";

const P256 = { name: "ECDH", namedCurve: "P-256" } as const;

/**
 * Identity keypair. The private key is extractable only so it can be wrapped under the
 * unlock key; it must never be exported in the clear.
 */
export function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(P256, true, ["deriveBits"]);
}

/** Uncompressed SEC1 point (65 bytes): the only form of a key that may leave the device. */
export async function exportPublicKey(publicKey: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
}

export function importPublicKey(raw: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, P256, true, []);
}

/** Raw ECDH shared secret (x-coordinate, 32 bytes). Feed it to HKDF, never use it directly. */
export async function ecdhSharedSecret(
  privateKey: CryptoKey,
  peerPublic: CryptoKey,
): Promise<Bytes> {
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: peerPublic },
      privateKey,
      256,
    ),
  );
}

export async function hkdf(
  ikm: Bytes,
  salt: Bytes,
  info: Bytes,
  length: number,
): Promise<Bytes> {
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info },
      base,
      length * 8,
    ),
  );
}

/** Non-extractable AES-KW key-encryption key from an ECDH agreement. */
export async function deriveWrappingKey(
  privateKey: CryptoKey,
  peerPublic: CryptoKey,
  salt: Bytes,
  info: Bytes,
): Promise<CryptoKey> {
  const shared = await ecdhSharedSecret(privateKey, peerPublic);
  try {
    const okm = await hkdf(shared, salt, info, 32);
    try {
      return await importKek(okm);
    } finally {
      okm.fill(0);
    }
  } finally {
    shared.fill(0);
  }
}

export function importKek(raw: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, "AES-KW", false, [
    "wrapKey",
    "unwrapKey",
  ]);
}

/** Household data key: random AES-256-GCM. Extractable only so it can be AES-KW wrapped. */
export function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function wrapDataKey(
  kek: CryptoKey,
  dataKey: CryptoKey,
): Promise<Bytes> {
  return new Uint8Array(
    await crypto.subtle.wrapKey("raw", dataKey, kek, "AES-KW"),
  );
}

/** Throws on a wrong KEK or tampered blob (AES-KW integrity check). */
export function unwrapDataKey(
  kek: CryptoKey,
  wrapped: Bytes,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    kek,
    "AES-KW",
    "AES-GCM",
    true,
    ["encrypt", "decrypt"],
  );
}
