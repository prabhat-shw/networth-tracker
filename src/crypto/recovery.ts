/**
 * Recovery code (ADR-0002, ADR-0018): 24 BIP-39 English words = 256 bits of entropy plus an
 * 8-bit checksum. Generated on-device; the words are shown once and never stored or sent.
 * The entropy is already full strength, so HKDF (not Argon2id) turns it into the key.
 */
import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { type Bytes, randomBytes } from "./kdf";
import { hkdf } from "./keys";

const ENTROPY_BYTES = 32;
const INFO = new TextEncoder().encode("nwt/recovery-key/v1");

/** Thrown for a mistyped code: wrong word count, unknown word or bad checksum. */
export class RecoveryCodeError extends Error {
  constructor() {
    super("invalid recovery code");
    this.name = "RecoveryCodeError";
  }
}

export function generateRecoveryCode(): string {
  const entropy = randomBytes(ENTROPY_BYTES);
  try {
    return entropyToMnemonic(entropy, wordlist);
  } finally {
    entropy.fill(0);
  }
}

/** Case, spacing and line breaks are forgiven, so a hand-copied kit still works. */
export function normaliseRecoveryCode(code: string): string {
  return code.normalize("NFKD").toLowerCase().trim().split(/\s+/).join(" ");
}

/** Non-extractable AES-256-GCM key that wraps the identity private key. */
export async function deriveRecoveryKey(code: string): Promise<CryptoKey> {
  const words = normaliseRecoveryCode(code);
  if (words.split(" ").length !== 24) throw new RecoveryCodeError();
  let entropy: Bytes;
  try {
    entropy = new Uint8Array(mnemonicToEntropy(words, wordlist));
  } catch {
    throw new RecoveryCodeError();
  }
  try {
    const okm = await hkdf(entropy, new Uint8Array(0), INFO, 32);
    try {
      return await crypto.subtle.importKey("raw", okm, "AES-GCM", false, [
        "wrapKey",
        "unwrapKey",
      ]);
    } finally {
      okm.fill(0);
    }
  } finally {
    entropy.fill(0);
  }
}
