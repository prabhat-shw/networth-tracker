/**
 * JSON wire form of the identity vault (ADR-0022). Bytes travel as base64url. Decoding is
 * strict and bounded: the vault comes back from a server we do not trust, and its KDF
 * params decide how much memory and time Argon2id spends on this device. A hostile or
 * corrupted server must not be able to hang or crash the unlock screen, nor downgrade the
 * work factor to something trivially brute-forced.
 *
 * v1 has no passkey slots; v2 adds `passkeys` (ADR-0033). A vault without passkeys is still
 * written as v1, so it stays byte-identical and readable by clients that predate v2.
 */
import type { Bytes, KdfParams } from "./kdf";
import type { IdentityVault } from "./vault";
// Type-only imports: the test setup mocks kdf.ts by importing this module, so a runtime
// import back into the crypto graph would deadlock that mock.
import type { PasskeySlot } from "./vault-passkey";

export class VaultFormatError extends Error {
  constructor(reason: string) {
    super(`invalid vault: ${reason}`);
    this.name = "VaultFormatError";
  }
}

/** Accepted Argon2id range. The floor is OWASP's minimum; the ceiling fits a phone. */
export const KDF_BOUNDS = {
  memoryKiB: { min: 19 * 1024, max: 1024 * 1024 },
  iterations: { min: 2, max: 10 },
  parallelism: { min: 1, max: 4 },
  saltBytes: { min: 16, max: 64 },
} as const;

export const PASSKEY_BOUNDS = {
  maxSlots: 5,
  /** WebAuthn: at least 16 bytes of entropy, at most 1023 bytes. */
  credentialIdBytes: { min: 16, max: 1023 },
  prfSaltBytes: 32,
  prfOutputBytes: 32,
} as const;

export function sameBytes(a: Bytes, b: Bytes): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

const PUBLIC_KEY_BYTES = 65;
const MAX_WRAP_BYTES = 512;
/**
 * A v1 vault is ~800 bytes; each passkey slot adds ~350 (up to ~1.7 KB with the longest
 * credential id WebAuthn allows), and there are at most `PASSKEY_BOUNDS.maxSlots`.
 */
export const MAX_VAULT_JSON_BYTES = 12 * 1024;

export interface PasskeySlotWire {
  credentialId: string;
  prfSalt: string;
  wrap: string;
}

export interface VaultWire {
  v: 1 | 2;
  publicKey: string;
  kdf: {
    alg: "argon2id";
    memoryKiB: number;
    iterations: number;
    parallelism: number;
    salt: string;
  };
  byPassphrase: string;
  byRecovery: string;
  /** v2 only. */
  passkeys?: PasskeySlotWire[];
}

export function toBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(text: string): Bytes {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1)
    throw new VaultFormatError("bad base64url");
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeVault(vault: IdentityVault): VaultWire {
  const base: VaultWire = {
    v: 1,
    publicKey: toBase64url(vault.publicKey),
    kdf: {
      alg: vault.kdf.alg,
      memoryKiB: vault.kdf.memoryKiB,
      iterations: vault.kdf.iterations,
      parallelism: vault.kdf.parallelism,
      salt: toBase64url(vault.kdf.salt),
    },
    byPassphrase: toBase64url(vault.byPassphrase),
    byRecovery: toBase64url(vault.byRecovery),
  };
  if (vault.passkeys.length === 0) return base;
  return {
    ...base,
    v: 2,
    passkeys: vault.passkeys.map((s) => ({
      credentialId: toBase64url(s.credentialId),
      prfSalt: toBase64url(s.prfSalt),
      wrap: toBase64url(s.wrap),
    })),
  };
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

function exactKeys(obj: Record<string, unknown>, keys: string[], at: string) {
  const got = Object.keys(obj).sort().join();
  if (got !== [...keys].sort().join()) throw new VaultFormatError(`${at} keys`);
}

function bytes(x: unknown, at: string, min: number, max: number): Bytes {
  if (typeof x !== "string") throw new VaultFormatError(at);
  const out = fromBase64url(x);
  if (out.length < min || out.length > max) throw new VaultFormatError(at);
  return out;
}

function bounded(x: unknown, at: keyof typeof KDF_BOUNDS): number {
  const { min, max } = KDF_BOUNDS[at];
  if (!Number.isInteger(x) || (x as number) < min || (x as number) > max)
    throw new VaultFormatError(`kdf.${at} out of bounds`);
  return x as number;
}

function passkeySlots(x: unknown): PasskeySlot[] {
  if (!Array.isArray(x)) throw new VaultFormatError("passkeys");
  // v2 exists only to carry slots; an empty list is written as v1.
  if (x.length < 1 || x.length > PASSKEY_BOUNDS.maxSlots)
    throw new VaultFormatError("passkeys count");
  const { min, max } = PASSKEY_BOUNDS.credentialIdBytes;
  const salt = PASSKEY_BOUNDS.prfSaltBytes;
  const slots = x.map((slot, i): PasskeySlot => {
    const at = `passkeys[${i}]`;
    if (!isObject(slot)) throw new VaultFormatError(at);
    exactKeys(slot, ["credentialId", "prfSalt", "wrap"], at);
    return {
      credentialId: bytes(slot.credentialId, `${at}.credentialId`, min, max),
      prfSalt: bytes(slot.prfSalt, `${at}.prfSalt`, salt, salt),
      wrap: bytes(slot.wrap, `${at}.wrap`, 1, MAX_WRAP_BYTES),
    };
  });
  slots.forEach((s, i) => {
    if (
      slots.slice(0, i).some((t) => sameBytes(t.credentialId, s.credentialId))
    )
      throw new VaultFormatError("duplicate passkey");
  });
  return slots;
}

const V1_KEYS = ["v", "publicKey", "kdf", "byPassphrase", "byRecovery"];

/** Throws `VaultFormatError` for anything but a well-formed, in-bounds v1 or v2 vault. */
export function decodeVault(input: unknown): IdentityVault {
  if (!isObject(input)) throw new VaultFormatError("not an object");
  if (input.v !== 1 && input.v !== 2) throw new VaultFormatError("version");
  exactKeys(input, input.v === 1 ? V1_KEYS : [...V1_KEYS, "passkeys"], "vault");
  const { kdf } = input;
  if (!isObject(kdf)) throw new VaultFormatError("kdf");
  exactKeys(
    kdf,
    ["alg", "memoryKiB", "iterations", "parallelism", "salt"],
    "kdf",
  );
  if (kdf.alg !== "argon2id") throw new VaultFormatError("kdf.alg");
  const { min, max } = KDF_BOUNDS.saltBytes;
  const params: KdfParams = {
    alg: "argon2id",
    memoryKiB: bounded(kdf.memoryKiB, "memoryKiB"),
    iterations: bounded(kdf.iterations, "iterations"),
    parallelism: bounded(kdf.parallelism, "parallelism"),
    salt: bytes(kdf.salt, "kdf.salt", min, max),
  };
  const publicKey = bytes(
    input.publicKey,
    "publicKey",
    PUBLIC_KEY_BYTES,
    PUBLIC_KEY_BYTES,
  );
  if (publicKey[0] !== 0x04) throw new VaultFormatError("publicKey");
  return {
    v: 2,
    publicKey,
    kdf: params,
    byPassphrase: bytes(input.byPassphrase, "byPassphrase", 1, MAX_WRAP_BYTES),
    byRecovery: bytes(input.byRecovery, "byRecovery", 1, MAX_WRAP_BYTES),
    passkeys: input.v === 2 ? passkeySlots(input.passkeys) : [],
  };
}
