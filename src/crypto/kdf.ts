/**
 * Passphrase -> unlock key (ADR-0002). Argon2id via hash-wasm; the parameters travel with
 * whatever the key wraps, so they can be raised later without breaking old vaults.
 */
import { argon2id } from "hash-wasm";

export type Bytes = Uint8Array<ArrayBuffer>;

export interface KdfParams {
  alg: "argon2id";
  /** Memory cost in KiB. */
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  salt: Bytes;
}

/** ADR-0002: m=64 MiB, t=3, p=1. */
export const DEFAULT_KDF = {
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
} as const;

const SALT_BYTES = 16;
const KEY_BYTES = 32;

export function newKdfParams(): KdfParams {
  return { alg: "argon2id", ...DEFAULT_KDF, salt: randomBytes(SALT_BYTES) };
}

/**
 * Raw Argon2id output. Exported for the known-answer tests only; callers use
 * `deriveUnlockKey`, which never lets the bytes escape.
 */
export async function argon2idBytes(
  password: string | Bytes,
  params: KdfParams,
  hashLength = KEY_BYTES,
): Promise<Bytes> {
  if (params.alg !== "argon2id") throw new Error("unsupported kdf");
  const out = await argon2id({
    password,
    salt: params.salt,
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memoryKiB,
    hashLength,
    outputType: "binary",
  });
  return new Uint8Array(out);
}

/**
 * Derives the non-extractable AES-256-GCM unlock key that wraps the user's private key.
 * Returns the params used so they are stored alongside the wrapped output.
 */
export async function deriveUnlockKey(
  passphrase: string,
  params: KdfParams = newKdfParams(),
): Promise<{ key: CryptoKey; params: KdfParams }> {
  const raw = await argon2idBytes(passphrase.normalize("NFKC"), params);
  try {
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
      "wrapKey",
      "unwrapKey",
    ]);
    return { key, params };
  } finally {
    raw.fill(0);
  }
}

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}
