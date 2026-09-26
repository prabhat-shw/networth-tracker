// Vault relay on real Postgres (ADR-0022). Sessions are stubbed: the session → user path is
// covered with real Better Auth in records.pg.test.ts; here the subject is the vault rules.
import { beforeAll, describe, expect, it } from "vitest";
import { createIdentity } from "@/crypto/vault";
import {
  decodeVault,
  encodeVault,
  toBase64url,
  type VaultWire,
} from "@/crypto/wire";
import * as schema from "./db/schema";
import { migratedDb } from "./db/test-db";
import type { GuardDeps } from "./guard";
import { getVault, putVault } from "./vault";

const ORIGIN = "https://nwt.example";
const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";

let deps: GuardDeps;
let wire: VaultWire;

beforeAll(async () => {
  const db = await migratedDb();
  await db.insert(schema.user).values([
    { id: ASHA, name: "Asha", email: "asha@example.com" },
    { id: BALA, name: "Bala", email: "bala@example.com" },
  ]);
  deps = { db, sessionUser: async (h) => h.get("x-test-user") };
  wire = encodeVault((await createIdentity("pass phrase one")).vault);
}, 30_000);

const as = (user?: string): Record<string, string> =>
  user ? { "x-test-user": user } : {};
const get = (user?: string) =>
  getVault(
    deps,
    new Request(`${ORIGIN}/api/identity/vault`, { headers: as(user) }),
  );
const put = (
  user: string | undefined,
  body: unknown,
  type = "application/json",
) =>
  putVault(
    deps,
    new Request(`${ORIGIN}/api/identity/vault`, {
      method: "PUT",
      headers: { ...as(user), "content-type": type },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("identity vault relay", () => {
  it("needs a session", async () => {
    expect((await get()).status).toBe(401);
    expect((await put(undefined, wire)).status).toBe(401);
  });

  it("404s before the first upload", async () => {
    expect((await get(ASHA)).status).toBe(404);
  });

  it("stores and returns the vault byte-for-byte", async () => {
    expect((await put(ASHA, wire)).status).toBe(204);
    const res = await get(ASHA);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual(wire);
    expect(() => decodeVault(body)).not.toThrow();
  });

  it("is per user: Bala cannot see Asha's vault", async () => {
    expect((await get(BALA)).status).toBe(404);
  });

  it("accepts a re-wrap under the same public key (passphrase change)", async () => {
    const rewrapped = {
      ...wire,
      byPassphrase: toBase64url(new Uint8Array(180).fill(7)),
    };
    expect((await put(ASHA, rewrapped)).status).toBe(204);
    expect((await (await get(ASHA)).json()).byPassphrase).toBe(
      rewrapped.byPassphrase,
    );
  });

  it("refuses to change the public key once set", async () => {
    const other = new Uint8Array(65).fill(9);
    other[0] = 0x04;
    const swapped = { ...wire, publicKey: toBase64url(other) };
    const res = await put(ASHA, swapped);
    expect(res.status).toBe(409);
    expect((await (await get(ASHA)).json()).publicKey).toBe(wire.publicKey);
  });

  it("rejects malformed, out-of-bounds, oversized and non-JSON uploads", async () => {
    expect((await put(BALA, "{not json")).status).toBe(400);
    expect((await put(BALA, { ...wire, extra: 1 })).status).toBe(400);
    const greedy = {
      ...wire,
      kdf: { ...wire.kdf, memoryKiB: 64 * 1024 * 1024 },
    };
    expect((await put(BALA, greedy)).status).toBe(400);
    expect((await put(BALA, "x".repeat(5000))).status).toBe(413);
    expect((await put(BALA, wire, "text/plain")).status).toBe(415);
    expect((await get(BALA)).status).toBe(404);
  });

  it("stores canonical JSON, not what the client sent", async () => {
    const { byRecovery, ...rest } = wire;
    const reordered = JSON.stringify({ byRecovery, ...rest });
    expect((await put(BALA, reordered)).status).toBe(204);
    expect(await (await get(BALA)).text()).toBe(JSON.stringify(wire));
  });
});
