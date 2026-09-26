/**
 * Record encryption (ADR-0002, ADR-0013): AES-256-GCM, random 96-bit IV per seal,
 * AAD = `recordId|version`. The envelope carries a key id so the HDK can rotate later.
 *
 * Envelope bytes: [0x01][kidLen:u8][kid utf8][iv:12][ciphertext+tag:16]
 */
import { type Bytes, randomBytes } from "./kdf";

const FORMAT_V1 = 0x01;
export const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_KID_BYTES = 255;

/** Single opaque failure: callers (and attackers) learn nothing about why it failed. */
export class DecryptError extends Error {
  constructor() {
    super("decryption failed");
    this.name = "DecryptError";
  }
}

export function recordAad(recordId: string, version: number): Bytes {
  if (recordId.includes("|")) throw new Error("recordId must not contain '|'");
  if (!Number.isSafeInteger(version) || version < 0)
    throw new Error("invalid version");
  return new TextEncoder().encode(`${recordId}|${version}`);
}

export async function seal(
  key: CryptoKey,
  plaintext: Bytes,
  aad: Bytes,
  kid: string,
): Promise<Bytes> {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      key,
      plaintext,
    ),
  );
  return encodeEnvelope(kid, iv, ct);
}

/** Frames an AES-GCM output (from `seal` or a GCM `wrapKey`) as a v1 envelope. */
export function encodeEnvelope(kid: string, iv: Bytes, ct: Bytes): Bytes {
  const kidBytes = new TextEncoder().encode(kid);
  if (kidBytes.length > MAX_KID_BYTES) throw new Error("kid too long");
  if (iv.length !== IV_BYTES) throw new Error("invalid iv");
  const out = new Uint8Array(2 + kidBytes.length + IV_BYTES + ct.length);
  out[0] = FORMAT_V1;
  out[1] = kidBytes.length;
  out.set(kidBytes, 2);
  out.set(iv, 2 + kidBytes.length);
  out.set(ct, 2 + kidBytes.length + IV_BYTES);
  return out;
}

export interface Envelope {
  kid: string;
  iv: Bytes;
  ct: Bytes;
}

export function parseEnvelope(sealed: Bytes): Envelope {
  if (sealed.length < 2 || sealed[0] !== FORMAT_V1) throw new DecryptError();
  const kidLen = sealed[1];
  const ivAt = 2 + kidLen;
  if (sealed.length < ivAt + IV_BYTES + TAG_BYTES) throw new DecryptError();
  return {
    kid: new TextDecoder().decode(sealed.subarray(2, ivAt)),
    iv: sealed.slice(ivAt, ivAt + IV_BYTES),
    ct: sealed.slice(ivAt + IV_BYTES),
  };
}

/** Throws `DecryptError` on any failure: wrong key, tampered AAD, IV, kid or ciphertext. */
export async function open(
  key: CryptoKey,
  sealed: Bytes,
  aad: Bytes,
): Promise<Bytes> {
  const { iv, ct } = parseEnvelope(sealed);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad },
        key,
        ct,
      ),
    );
  } catch {
    throw new DecryptError();
  }
}
