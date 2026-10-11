/**
 * JSON wire form of the identity vault (ADR-0022). Bytes travel as base64url. Decoding is
 * strict and bounded: the vault comes back from a server we do not trust, and its KDF
 * params decide how much memory and time Argon2id spends on this device. A hostile or
 * corrupted server must not be able to hang or crash the unlock screen, nor downgrade the
 * work factor to something trivially brute-forced.
 *
 * v1 has no passkey slots; v2 adds `passkeys` (ADR-0033). A vault without passkeys is still
 * written as v1, so it stays byte-identical and readable by clients that predate v2. v3
 * (ADR-0038) makes the passphrase and recovery slots optional; it is written only when one
 * of them is missing, so a vault that fits v1 or v2 never changes form.
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
  v: 1 | 2 | 3;
  publicKey: string;
  /** v3: `kdf` and `byPassphrase` are both present or both absent. */
  kdf?: {
    alg: "argon2id";
    memoryKiB: number;
    iterations: number;
    parallelism: number;
    salt: string;
  };
  byPassphrase?: string;
  /** Optional in v3 only. */
  byRecovery?: string;
  /** v2 (non-empty), or v3 (non-empty when present). */
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

function encodeKdf(kdf: KdfParams): NonNullable<VaultWire["kdf"]> {
  return {
    alg: kdf.alg,
    memoryKiB: kdf.memoryKiB,
    iterations: kdf.iterations,
    parallelism: kdf.parallelism,
    salt: toBase64url(kdf.salt),
  };
}

/** v1 or v2 when both the passphrase and recovery slots exist; v3 otherwise. */
export function encodeVault(vault: IdentityVault): VaultWire {
  if ((vault.kdf === null) !== (vault.byPassphrase === null))
    throw new VaultFormatError("passphrase slot");
  const full = vault.byPassphrase !== null && vault.byRecovery !== null;
  const out: VaultWire = {
    v: full ? 1 : 3,
    publicKey: toBase64url(vault.publicKey),
  };
  if (vault.kdf && vault.byPassphrase) {
    out.kdf = encodeKdf(vault.kdf);
    out.byPassphrase = toBase64url(vault.byPassphrase);
  }
  if (vault.byRecovery) out.byRecovery = toBase64url(vault.byRecovery);
  if (vault.passkeys.length === 0) return out;
  return {
    ...out,
    v: full ? 2 : 3,
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
  // `passkeys` exists only to carry slots; an empty list is left out (v1, or v3 without it).
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
const V3_OPTIONAL = ["kdf", "byPassphrase", "byRecovery", "passkeys"];

/** v3: only the keys present, each optional; the passphrase pair travels together. */
function v3Keys(input: Record<string, unknown>): string[] {
  const keys = ["v", "publicKey", ...V3_OPTIONAL.filter((k) => k in input)];
  if ("kdf" in input !== "byPassphrase" in input)
    throw new VaultFormatError("passphrase slot");
  // A vault with both slots has a v1/v2 form; one canonical form per vault.
  if ("byPassphrase" in input && "byRecovery" in input)
    throw new VaultFormatError("v3 with both slots");
  return keys;
}

function decodeKdf(kdf: unknown): KdfParams {
  if (!isObject(kdf)) throw new VaultFormatError("kdf");
  exactKeys(
    kdf,
    ["alg", "memoryKiB", "iterations", "parallelism", "salt"],
    "kdf",
  );
  if (kdf.alg !== "argon2id") throw new VaultFormatError("kdf.alg");
  const { min, max } = KDF_BOUNDS.saltBytes;
  return {
    alg: "argon2id",
    memoryKiB: bounded(kdf.memoryKiB, "memoryKiB"),
    iterations: bounded(kdf.iterations, "iterations"),
    parallelism: bounded(kdf.parallelism, "parallelism"),
    salt: bytes(kdf.salt, "kdf.salt", min, max),
  };
}

const wrapOrNull = (x: unknown, at: string) =>
  x === undefined ? null : bytes(x, at, 1, MAX_WRAP_BYTES);

/** Throws `VaultFormatError` for anything but a well-formed, in-bounds v1, v2 or v3 vault. */
export function decodeVault(input: unknown): IdentityVault {
  if (!isObject(input)) throw new VaultFormatError("not an object");
  const keys =
    input.v === 1
      ? V1_KEYS
      : input.v === 2
        ? [...V1_KEYS, "passkeys"]
        : input.v === 3
          ? v3Keys(input)
          : null;
  if (!keys) throw new VaultFormatError("version");
  exactKeys(input, keys, "vault");
  const publicKey = bytes(
    input.publicKey,
    "publicKey",
    PUBLIC_KEY_BYTES,
    PUBLIC_KEY_BYTES,
  );
  if (publicKey[0] !== 0x04) throw new VaultFormatError("publicKey");
  return {
    v: 3,
    publicKey,
    kdf: input.kdf === undefined ? null : decodeKdf(input.kdf),
    byPassphrase: wrapOrNull(input.byPassphrase, "byPassphrase"),
    byRecovery: wrapOrNull(input.byRecovery, "byRecovery"),
    passkeys: input.passkeys === undefined ? [] : passkeySlots(input.passkeys),
  };
}

/**
 * Which slots a vault has, never their contents (ADR-0038). The server uses this to refuse
 * the first data or invite while no recovery method exists (ADR-0037, #90).
 */
export interface VaultSlots {
  passphrase: boolean;
  recovery: boolean;
  passkeys: number;
}

export function vaultSlots(vault: IdentityVault): VaultSlots {
  return {
    passphrase: vault.byPassphrase !== null,
    recovery: vault.byRecovery !== null,
    passkeys: vault.passkeys.length,
  };
}

export const hasRecoveryMethod = (s: VaultSlots): boolean =>
  s.passphrase || s.recovery || s.passkeys > 0;
