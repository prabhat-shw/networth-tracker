import { wordlist } from "@scure/bip39/wordlists/english.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecryptError } from "./aead";
import type { Bytes } from "./kdf";
import {
  deriveWrappingKey,
  generateDataKey,
  generateIdentityKeyPair,
  unwrapDataKey,
  wrapDataKey,
} from "./keys";
import { RecoveryCodeError } from "./recovery";
import {
  changePassphrase,
  createIdentity,
  type IdentityVault,
  restoreWithRecoveryCode,
  rotateRecoveryCode,
  unlockWithPassphrase,
} from "./vault";

const PASS = "correct horse battery staple";
const utf8 = (s: string): Bytes => new TextEncoder().encode(s);
const b64url = (b: ArrayBuffer | Uint8Array) =>
  Buffer.from(b as Uint8Array).toString("base64url");

/** What a fresh browser profile gets back from IndexedDB or the server. */
const reload = (vault: IdentityVault): IdentityVault => structuredClone(vault);

const contains = (hay: Uint8Array, needle: Uint8Array) =>
  Buffer.from(hay).indexOf(Buffer.from(needle)) !== -1;

async function sharedBits(priv: CryptoKey, pub: CryptoKey) {
  return b64url(
    await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("identity vault", () => {
  it("creates an identity that unlocks with the passphrase only", async () => {
    const { vault, identity } = await createIdentity(PASS);
    expect(identity.privateKey.extractable).toBe(false);

    const again = await unlockWithPassphrase(reload(vault), PASS);
    const peer = await generateIdentityKeyPair();
    expect(await sharedBits(again.privateKey, peer.publicKey)).toBe(
      await sharedBits(peer.privateKey, identity.publicKey),
    );

    await expect(unlockWithPassphrase(vault, "wrong")).rejects.toThrow(
      DecryptError,
    );
  });

  it("fails closed when wraps are swapped or the public key is replaced", async () => {
    const { vault } = await createIdentity(PASS);
    const other = await createIdentity(PASS);
    await expect(
      unlockWithPassphrase({ ...vault, byPassphrase: vault.byRecovery }, PASS),
    ).rejects.toThrow(DecryptError);
    await expect(
      unlockWithPassphrase(
        { ...vault, publicKey: other.vault.publicKey },
        PASS,
      ),
    ).rejects.toThrow(DecryptError);
  });

  it("changes the passphrase without touching the keypair, recovery wrap or HDK", async () => {
    const { vault, identity } = await createIdentity(PASS);
    const owner = await generateIdentityKeyPair();
    const salt = utf8("salt");
    const info = utf8("info");
    const hdk = await generateDataKey();
    const wrappedHdk = await wrapDataKey(
      await deriveWrappingKey(owner.privateKey, identity.publicKey, salt, info),
      hdk,
    );

    const next = await changePassphrase(reload(vault), PASS, "new passphrase");
    expect(next.publicKey).toEqual(vault.publicKey);
    expect(next.byRecovery).toEqual(vault.byRecovery);
    expect(next.kdf.salt).not.toEqual(vault.kdf.salt);
    await expect(unlockWithPassphrase(next, PASS)).rejects.toThrow(
      DecryptError,
    );

    const member = await unlockWithPassphrase(next, "new passphrase");
    const kek = await deriveWrappingKey(
      member.privateKey,
      owner.publicKey,
      salt,
      info,
    );
    const back = await unwrapDataKey(kek, wrappedHdk);
    expect(await crypto.subtle.exportKey("raw", back)).toEqual(
      await crypto.subtle.exportKey("raw", hdk),
    );
    await expect(changePassphrase(vault, "wrong", "anything")).rejects.toThrow(
      DecryptError,
    );
  });
});

describe("recovery code", () => {
  it("is 24 BIP-39 words", async () => {
    const { recoveryCode } = await createIdentity(PASS);
    const words = recoveryCode.split(" ");
    expect(words).toHaveLength(24);
    for (const w of words) expect(wordlist).toContain(w);
  });

  it("restores access on a fresh profile from the stored vault alone", async () => {
    const { vault, recoveryCode, identity } = await createIdentity(PASS);
    const typed = `  ${recoveryCode.toUpperCase().replaceAll(" ", "\n ")} `;
    const restored = await restoreWithRecoveryCode(
      reload(vault),
      typed,
      "fresh passphrase",
    );
    expect(restored.vault.publicKey).toEqual(vault.publicKey);
    expect(restored.identity.privateKey.extractable).toBe(false);

    const peer = await generateIdentityKeyPair();
    expect(await sharedBits(restored.identity.privateKey, peer.publicKey)).toBe(
      await sharedBits(peer.privateKey, identity.publicKey),
    );
    await unlockWithPassphrase(restored.vault, "fresh passphrase");
    await expect(unlockWithPassphrase(restored.vault, PASS)).rejects.toThrow(
      DecryptError,
    );
  });

  it("rejects mistyped codes and another vault's code", async () => {
    const { vault, recoveryCode } = await createIdentity(PASS);
    const other = await createIdentity(PASS);
    const words = recoveryCode.split(" ");
    const badChecksum = [
      ...words.slice(0, 23),
      words[23] === "zoo" ? "abandon" : "zoo",
    ];
    for (const code of [
      words.slice(1).join(" "),
      [...words.slice(1), "notaword"].join(" "),
      badChecksum.join(" "),
    ]) {
      await expect(restoreWithRecoveryCode(vault, code, "x")).rejects.toThrow(
        RecoveryCodeError,
      );
    }
    await expect(
      restoreWithRecoveryCode(vault, other.recoveryCode, "x"),
    ).rejects.toThrow(DecryptError);
  });

  it("rotates: the old code stops working, the new one restores", async () => {
    const { vault, recoveryCode } = await createIdentity(PASS);
    const rotated = await rotateRecoveryCode(vault, PASS);
    expect(rotated.vault.byPassphrase).toEqual(vault.byPassphrase);
    await expect(
      restoreWithRecoveryCode(rotated.vault, recoveryCode, "x"),
    ).rejects.toThrow(DecryptError);
    await restoreWithRecoveryCode(rotated.vault, rotated.recoveryCode, "y");
  });
});

describe("the private key never leaves the device", () => {
  it("is absent from the vault and no storage or network API is touched", async () => {
    const pairs: CryptoKeyPair[] = [];
    const generateKey = crypto.subtle.generateKey.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "generateKey").mockImplementation(
      async (...args: Parameters<typeof generateKey>) => {
        const out = await generateKey(...args);
        if ("privateKey" in out) pairs.push(out);
        return out;
      },
    );
    const fetchSpy = vi.fn();
    const idbSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("indexedDB", { open: idbSpy, deleteDatabase: idbSpy });

    const { vault, recoveryCode } = await createIdentity(PASS);
    const changed = await changePassphrase(vault, PASS, "p2");
    const restored = await restoreWithRecoveryCode(changed, recoveryCode, "p3");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(idbSpy).not.toHaveBeenCalled();

    expect(pairs).toHaveLength(1);
    const jwk = await crypto.subtle.exportKey("jwk", pairs[0].privateKey);
    const d = new Uint8Array(Buffer.from(jwk.d ?? "", "base64url"));
    const pkcs8 = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", pairs[0].privateKey),
    );
    expect(d).toHaveLength(32);

    for (const v of [vault, changed, restored.vault]) {
      expect(Object.keys(v).sort()).toEqual(
        ["byPassphrase", "byRecovery", "kdf", "publicKey", "v"].sort(),
      );
      for (const field of [v.publicKey, v.byPassphrase, v.byRecovery]) {
        expect(field).toBeInstanceOf(Uint8Array);
        expect(contains(field, d)).toBe(false);
        expect(contains(field, pkcs8)).toBe(false);
      }
      const json = JSON.stringify(v, (_k, x) =>
        x instanceof Uint8Array ? b64url(x) : x,
      );
      expect(json).not.toContain(jwk.d);
      expect(json).not.toContain(recoveryCode);
    }
  });
});
