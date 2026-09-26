import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_KDF } from "./kdf";
import {
  createIdentity,
  type IdentityVault,
  unlockWithPassphrase,
} from "./vault";
import {
  decodeVault,
  encodeVault,
  fromBase64url,
  KDF_BOUNDS,
  toBase64url,
  VaultFormatError,
  type VaultWire,
} from "./wire";

let vault: IdentityVault;
let wire: VaultWire;

beforeAll(async () => {
  ({ vault } = await createIdentity("correct horse battery staple"));
  wire = encodeVault(vault);
}, 30_000);

const tamper = (patch: (w: VaultWire & Record<string, unknown>) => void) => {
  const copy = structuredClone(wire) as VaultWire & Record<string, unknown>;
  patch(copy);
  return () => decodeVault(copy);
};

describe("base64url", () => {
  it("round-trips every byte value without padding", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    const text = toBase64url(all);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64url(text)).toEqual(all);
    expect(toBase64url(new Uint8Array([1, 2, 3]))).toBe("AQID");
  });

  it("rejects standard base64 and impossible lengths", () => {
    expect(() => fromBase64url("a+b/")).toThrow(VaultFormatError);
    expect(() => fromBase64url("AQID=")).toThrow(VaultFormatError);
    expect(() => fromBase64url("AQIDB")).toThrow(VaultFormatError);
  });
});

describe("vault wire codec", () => {
  it("survives JSON and still unlocks", { timeout: 30_000 }, async () => {
    const back = decodeVault(JSON.parse(JSON.stringify(wire)));
    expect(back).toEqual(vault);
    await expect(
      unlockWithPassphrase(back, "correct horse battery staple"),
    ).resolves.toBeDefined();
  });

  it("accepts the current defaults inside the bounds", () => {
    for (const k of ["memoryKiB", "iterations", "parallelism"] as const) {
      expect(DEFAULT_KDF[k]).toBeGreaterThanOrEqual(KDF_BOUNDS[k].min);
      expect(DEFAULT_KDF[k]).toBeLessThanOrEqual(KDF_BOUNDS[k].max);
    }
  });

  it.each([
    [
      "huge memory",
      (w: VaultWire) => {
        w.kdf.memoryKiB = 64 * 1024 * 1024;
      },
    ],
    [
      "tiny memory",
      (w: VaultWire) => {
        w.kdf.memoryKiB = 8;
      },
    ],
    [
      "huge iterations",
      (w: VaultWire) => {
        w.kdf.iterations = 1e9;
      },
    ],
    [
      "one iteration",
      (w: VaultWire) => {
        w.kdf.iterations = 1;
      },
    ],
    [
      "huge parallelism",
      (w: VaultWire) => {
        w.kdf.parallelism = 255;
      },
    ],
    [
      "fractional cost",
      (w: VaultWire) => {
        w.kdf.iterations = 2.5;
      },
    ],
    [
      "string cost",
      (w: VaultWire) => {
        (w.kdf as Record<string, unknown>).memoryKiB = "65536";
      },
    ],
    [
      "short salt",
      (w: VaultWire) => {
        w.kdf.salt = toBase64url(new Uint8Array(8));
      },
    ],
    [
      "other kdf",
      (w: VaultWire) => {
        (w.kdf as Record<string, unknown>).alg = "pbkdf2";
      },
    ],
  ])("rejects %s", (_, patch) => {
    expect(tamper(patch)).toThrow(VaultFormatError);
  });

  it.each([
    [
      "wrong version",
      (w: Record<string, unknown>) => {
        w.v = 2;
      },
    ],
    [
      "extra field",
      (w: Record<string, unknown>) => {
        w.plaintext = "hi";
      },
    ],
    [
      "missing field",
      (w: Record<string, unknown>) => {
        delete w.byRecovery;
      },
    ],
    [
      "compressed key",
      (w: Record<string, unknown>) => {
        w.publicKey = toBase64url(new Uint8Array(33).fill(2));
      },
    ],
    [
      "non-SEC1 key",
      (w: Record<string, unknown>) => {
        w.publicKey = toBase64url(new Uint8Array(65));
      },
    ],
    [
      "oversized wrap",
      (w: Record<string, unknown>) => {
        w.byPassphrase = toBase64url(new Uint8Array(4096));
      },
    ],
    [
      "empty wrap",
      (w: Record<string, unknown>) => {
        w.byRecovery = "";
      },
    ],
  ])("rejects %s", (_, patch) => {
    expect(tamper(patch)).toThrow(VaultFormatError);
  });

  it("rejects non-objects", () => {
    for (const x of [null, [], "vault", 1])
      expect(() => decodeVault(x)).toThrow(VaultFormatError);
  });
});
