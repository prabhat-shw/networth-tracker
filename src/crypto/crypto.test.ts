import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import kat from "./__vectors__/kat.json";
import { DecryptError, open, parseEnvelope, recordAad, seal } from "./aead";
import {
  argon2idBytes,
  type Bytes,
  DEFAULT_KDF,
  deriveUnlockKey,
  newKdfParams,
} from "./kdf";
import {
  deriveWrappingKey,
  ecdhSharedSecret,
  exportPublicKey,
  generateDataKey,
  generateIdentityKeyPair,
  hkdf,
  importKek,
  importPublicKey,
  unwrapDataKey,
  wrapDataKey,
} from "./keys";

const hex = (s: string): Bytes =>
  new Uint8Array(s.match(/../g)?.map((b) => Number.parseInt(b, 16)) ?? []);
const toHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const b64url = (b: Bytes) => Buffer.from(b).toString("base64url");
const utf8 = (s: string): Bytes => new TextEncoder().encode(s);

const aesKey = (raw: Bytes) =>
  crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

describe("known-answer vectors", () => {
  it.each(
    kat.argon2id.cases,
  )("argon2id $password m=$memoryKiB t=$iterations p=$parallelism", async (c) => {
    const out = await argon2idBytes(c.password, {
      alg: "argon2id",
      memoryKiB: c.memoryKiB,
      iterations: c.iterations,
      parallelism: c.parallelism,
      salt: utf8(c.salt),
    });
    expect(toHex(out)).toBe(c.hash);
  });

  it.each(
    kat.aesGcm256.cases,
  )("AES-256-GCM opens vector envelope ($iv)", async (c) => {
    const envelope = new Uint8Array([
      0x01,
      0x00,
      ...hex(c.iv),
      ...hex(c.ct),
      ...hex(c.tag),
    ]);
    const pt = await open(await aesKey(hex(c.key)), envelope, hex(c.aad));
    expect(toHex(pt)).toBe(c.msg);
  });

  it("HKDF-SHA-256 (RFC 5869 A.1)", async () => {
    const v = kat.hkdfSha256;
    expect(toHex(await hkdf(hex(v.ikm), hex(v.salt), hex(v.info), 42))).toBe(
      v.okm,
    );
  });

  it("AES-KW 256 (RFC 3394 4.6)", async () => {
    const v = kat.aesKw256;
    const kek = await importKek(hex(v.kek));
    const data = await crypto.subtle.importKey(
      "raw",
      hex(v.keyData),
      "AES-GCM",
      true,
      ["encrypt"],
    );
    expect(toHex(await wrapDataKey(kek, data))).toBe(v.wrapped);
    const back = await unwrapDataKey(kek, hex(v.wrapped));
    expect(
      toHex(new Uint8Array(await crypto.subtle.exportKey("raw", back))),
    ).toBe(v.keyData);
  });

  it("ECDH P-256 (RFC 5903 8.1)", async () => {
    const v = kat.ecdhP256;
    const priv = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        d: b64url(hex(v.i)),
        x: b64url(hex(v.gix)),
        y: b64url(hex(v.giy)),
      },
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
    const peer = await importPublicKey(
      new Uint8Array([0x04, ...hex(v.grx), ...hex(v.gry)]),
    );
    expect(toHex(await ecdhSharedSecret(priv, peer))).toBe(v.shared);
  });
});

describe("seal / open", () => {
  const aad = recordAad("rec-1", 3);

  it("round-trips and carries the key id", async () => {
    const key = await generateDataKey();
    const sealed = await seal(key, utf8("₹12,34,567"), aad, "hdk-1");
    expect(parseEnvelope(sealed).kid).toBe("hdk-1");
    expect(new TextDecoder().decode(await open(key, sealed, aad))).toBe(
      "₹12,34,567",
    );
  });

  it("fails closed on wrong key, tampered AAD, ciphertext, IV and format", async () => {
    const key = await generateDataKey();
    const sealed = await seal(key, utf8("secret"), aad, "k");
    const flip = (i: number) => {
      const t = sealed.slice();
      t[i] ^= 1;
      return t;
    };
    const ivAt = 2 + 1;
    await expect(
      open(await generateDataKey(), sealed, aad),
    ).rejects.toBeInstanceOf(DecryptError);
    await expect(
      open(key, sealed, recordAad("rec-1", 4)),
    ).rejects.toBeInstanceOf(DecryptError);
    await expect(
      open(key, sealed, recordAad("rec-2", 3)),
    ).rejects.toBeInstanceOf(DecryptError);
    await expect(
      open(key, flip(sealed.length - 1), aad),
    ).rejects.toBeInstanceOf(DecryptError);
    await expect(open(key, flip(ivAt + 12), aad)).rejects.toBeInstanceOf(
      DecryptError,
    );
    await expect(open(key, flip(ivAt), aad)).rejects.toBeInstanceOf(
      DecryptError,
    );
    await expect(open(key, flip(0), aad)).rejects.toBeInstanceOf(DecryptError);
    await expect(open(key, sealed.slice(0, 10), aad)).rejects.toBeInstanceOf(
      DecryptError,
    );
  });

  it("never repeats an IV across 10k seals", async () => {
    const key = await generateDataKey();
    const pt = utf8("x");
    const ivs = new Set<string>();
    for (let n = 0; n < 10_000; n++)
      ivs.add(toHex(parseEnvelope(await seal(key, pt, aad, "k")).iv));
    expect(ivs.size).toBe(10_000);
  });

  it("rejects ambiguous AAD inputs", () => {
    expect(() => recordAad("a|b", 1)).toThrow();
    expect(() => recordAad("a", -1)).toThrow();
    expect(() => recordAad("a", 1.5)).toThrow();
  });
});

describe("unlock key", () => {
  it(
    "uses ADR-0002 params and a wrong passphrase yields no usable key",
    { timeout: 30_000 },
    async () => {
      const params = newKdfParams();
      expect(params).toMatchObject({ alg: "argon2id", ...DEFAULT_KDF });
      expect(params.salt).toHaveLength(16);

      const { key } = await deriveUnlockKey(
        "correct horse battery staple",
        params,
      );
      expect(key.extractable).toBe(false);
      const sealed = await seal(
        key,
        utf8("private key"),
        utf8("identity"),
        "unlock",
      );

      const again = await deriveUnlockKey(
        "correct horse battery staple",
        params,
      );
      expect(
        new TextDecoder().decode(
          await open(again.key, sealed, utf8("identity")),
        ),
      ).toBe("private key");

      const wrong = await deriveUnlockKey(
        "correct horse battery stapler",
        params,
      );
      await expect(
        open(wrong.key, sealed, utf8("identity")),
      ).rejects.toBeInstanceOf(DecryptError);
    },
  );
});

describe("HDK sharing via ECDH -> HKDF -> AES-KW", () => {
  it("a second member unwraps the HDK and decrypts a record sealed by the first", async () => {
    const alice = await generateIdentityKeyPair();
    const bob = await generateIdentityKeyPair();
    const salt = utf8("household-1");
    const info = utf8("nwt/hdk-wrap/v1");

    const bobPublic = await importPublicKey(
      await exportPublicKey(bob.publicKey),
    );
    const hdk = await generateDataKey();
    const wrapped = await wrapDataKey(
      await deriveWrappingKey(alice.privateKey, bobPublic, salt, info),
      hdk,
    );
    const sealed = await seal(
      hdk,
      utf8("FD 5,00,000"),
      recordAad("r", 1),
      "hdk-1",
    );

    const alicePublic = await importPublicKey(
      await exportPublicKey(alice.publicKey),
    );
    const bobKek = await deriveWrappingKey(
      bob.privateKey,
      alicePublic,
      salt,
      info,
    );
    const bobHdk = await unwrapDataKey(bobKek, wrapped);
    expect(
      new TextDecoder().decode(await open(bobHdk, sealed, recordAad("r", 1))),
    ).toBe("FD 5,00,000");

    const eve = await generateIdentityKeyPair();
    const eveKek = await deriveWrappingKey(
      eve.privateKey,
      alicePublic,
      salt,
      info,
    );
    await expect(unwrapDataKey(eveKek, wrapped)).rejects.toThrow();
  });

  it("wrapping keys are non-extractable", async () => {
    const a = await generateIdentityKeyPair();
    const b = await generateIdentityKeyPair();
    const kek = await deriveWrappingKey(
      a.privateKey,
      b.publicKey,
      utf8("s"),
      utf8("i"),
    );
    expect(kek.extractable).toBe(false);
  });
});

describe("purity", () => {
  it("src/crypto imports no React or Next", () => {
    const dir = import.meta.dirname;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src, file).not.toMatch(
        /from\s+["'](react|react-dom|next)(\/|["'])/,
      );
    }
  });
});
