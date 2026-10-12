// Record push on real Postgres (ADR-0045): optimistic concurrency per record, one atomic
// transaction, a household-wide `seq` cursor, and the guard/recovery gates in front.
// Sessions are stubbed; the session → user path is covered in records.pg.test.ts.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createIdentity } from "@/crypto/vault";
import { encodeVault } from "@/crypto/wire";
import * as schema from "./db/schema";
import { migratedDb } from "./db/test-db";
import type { GuardDeps } from "./guard";
import { listRecords, type RecordEnvelope } from "./records";
import {
  type Applied,
  isPaddedEnvelope,
  MAX_ENVELOPE_BYTES,
  pushRecords,
} from "./records-push";

const ORIGIN = "https://nwt.example";
const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const CHITRA = "0c000000-0000-4000-8000-0000000000c1";
const HH_A = "0a000000-0000-4000-8000-00000000000a";
const HH_B = "0b000000-0000-4000-8000-00000000000b";

let db: Awaited<ReturnType<typeof migratedDb>>;
let deps: GuardDeps;

/** Shaped like an ADR-0013 envelope over `blocks` × 256 padded bytes; filled with `fill`. */
const envelope = (fill = 7, blocks = 1, kid = "hdk-1") => {
  const k = new TextEncoder().encode(kid);
  const out = new Uint8Array(2 + k.length + 12 + blocks * 256 + 16).fill(fill);
  out[0] = 1;
  out[1] = k.length;
  out.set(k, 2);
  return out;
};
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const rec = (id: string, version: number, fill = 7, deleted = false) => ({
  id,
  version,
  ciphertext: b64(envelope(fill)),
  deleted,
});

const push = (
  user: string | null,
  householdId: string,
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
) =>
  pushRecords(
    deps,
    new Request(`${ORIGIN}/api/households/${householdId}/records`, {
      method: "POST",
      headers: user ? { ...headers, "x-test-user": user } : headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    householdId,
  );
const pushOk = async (user: string, hh: string, records: unknown[]) => {
  const res = await push(user, hh, { records });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    applied: Applied[];
    conflicts: RecordEnvelope[];
  };
};
const pull = async (user: string, hh: string, since = 0) => {
  const res = await listRecords(
    deps,
    new Request(`${ORIGIN}/api/households/${hh}/records?since=${since}`, {
      headers: { "x-test-user": user },
    }),
    hh,
  );
  return ((await res.json()) as { records: RecordEnvelope[] }).records;
};
const recordSeq = async (hh: string) =>
  (
    await db
      .select({ s: schema.households.recordSeq })
      .from(schema.households)
      .where(eq(schema.households.id, hh))
  )[0].s;

beforeAll(async () => {
  db = await migratedDb();
  deps = { db, sessionUser: async (h) => h.get("x-test-user") };
  const users = [
    { id: ASHA, name: "Asha", email: "asha@example.com" },
    { id: BALA, name: "Bala", email: "bala@example.com" },
    { id: CHITRA, name: "Chitra", email: "chitra@example.com" },
  ];
  await db.insert(schema.user).values(users);
  for (const { id } of users) {
    const { vault } = await createIdentity("pass phrase one");
    const wire = encodeVault(vault);
    await db.insert(schema.identityVaults).values({
      userId: id,
      publicKey: vault.publicKey,
      // Chitra kept the key on this device only: no recovery slot (ADR-0040).
      vault: JSON.stringify(
        id === CHITRA ? { v: 3, publicKey: wire.publicKey } : wire,
      ),
    });
  }
  await db.insert(schema.households).values([{ id: HH_A }, { id: HH_B }]);
  const key = new Uint8Array(65);
  await db.insert(schema.householdMembers).values([
    { householdId: HH_A, memberId: ASHA, publicKey: key, wrappedHdk: key },
    { householdId: HH_A, memberId: CHITRA, publicKey: key, wrappedHdk: key },
    { householdId: HH_B, memberId: BALA, publicKey: key, wrappedHdk: key },
  ]);
}, 30_000);

describe("envelope shape (ADR-0045)", () => {
  it("accepts only v1 envelopes padded to whole 256-byte blocks, up to 64 KiB", () => {
    expect(isPaddedEnvelope(envelope())).toBe(true);
    expect(isPaddedEnvelope(envelope(7, 3, ""))).toBe(true);
    expect(isPaddedEnvelope(envelope(7, 0))).toBe(false);
    expect(isPaddedEnvelope(envelope().subarray(1))).toBe(false);
    const v2 = envelope();
    v2[0] = 2;
    expect(isPaddedEnvelope(v2)).toBe(false);
    const big = Math.floor((MAX_ENVELOPE_BYTES - 40) / 256);
    expect(isPaddedEnvelope(envelope(7, big))).toBe(true);
    expect(isPaddedEnvelope(envelope(7, big + 1))).toBe(false);
  });
});

describe("record push", () => {
  const R1 = "1a000000-0000-4000-8000-000000000001";
  const R2 = "1a000000-0000-4000-8000-000000000002";

  it("applies new records with fresh seqs and serves them on pull", async () => {
    const { applied, conflicts } = await pushOk(ASHA, HH_A, [
      rec(R1, 1),
      rec(R2, 1, 8, true),
    ]);
    expect(conflicts).toEqual([]);
    expect(applied.map((a) => [a.id, a.version, a.seq])).toEqual([
      [R1, 1, 1],
      [R2, 1, 2],
    ]);
    const pulled = await pull(ASHA, HH_A);
    expect(pulled.map((r) => [r.id, r.seq, r.deleted])).toEqual([
      [R1, 1, false],
      [R2, 2, true],
    ]);
    expect(pulled[0].ciphertext).toBe(b64(envelope()));
    expect(await recordSeq(HH_A)).toBe(2);
  });

  it("applies over the stored base and returns a stale write as a conflict", async () => {
    const first = await pushOk(ASHA, HH_A, [rec(R1, 2, 9)]);
    expect(first.applied.map((a) => a.seq)).toEqual([3]);

    // Another device still at base 1, plus a fresh edit of R2 in the same push.
    const { applied, conflicts } = await pushOk(ASHA, HH_A, [
      rec(R1, 2, 5),
      rec(R2, 2, 6),
    ]);
    expect(applied.map((a) => [a.id, a.seq])).toEqual([[R2, 4]]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      id: R1,
      householdId: HH_A,
      version: 2,
      seq: 3,
      ciphertext: b64(envelope(9)),
    });
    // The pull cursor only shows what changed after 3.
    expect((await pull(ASHA, HH_A, 3)).map((r) => r.id)).toEqual([R2]);
  });

  it("refuses a base the server never had, writing nothing", async () => {
    const R3 = "1a000000-0000-4000-8000-000000000003";
    const res = await push(ASHA, HH_A, {
      records: [
        rec(R3, 1),
        rec(R2, 1),
        rec("1a000000-0000-4000-8000-000000000004", 2),
      ],
    });
    expect(res.status).toBe(400);
    expect(await recordSeq(HH_A)).toBe(4);
    expect((await pull(ASHA, HH_A, 4)).length).toBe(0);
  });

  it("gives non-members the guard's 404 and refuses ids owned by another household", async () => {
    const other = await push(BALA, HH_A, { records: [rec(R1, 3)] });
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual({ error: "not found" });

    const R5 = "1b000000-0000-4000-8000-000000000005";
    const taken = await push(BALA, HH_B, { records: [rec(R5, 1), rec(R1, 3)] });
    expect(taken.status).toBe(400);
    expect(await taken.json()).toEqual({ error: "id taken" });
    expect(await pull(BALA, HH_B)).toEqual([]);
    expect((await pull(ASHA, HH_A)).find((r) => r.id === R1)?.version).toBe(2);
  });

  it("answers 409 recovery-required without a recovery slot, and writes nothing", async () => {
    const R6 = "1a000000-0000-4000-8000-000000000006";
    const res = await push(CHITRA, HH_A, { records: [rec(R6, 1)] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "recovery-required" });
    expect(await recordSeq(HH_A)).toBe(4);
  });

  it("rejects bad shapes and limits", async () => {
    const id = "1a000000-0000-4000-8000-000000000007";
    const bad = (records: unknown) => push(ASHA, HH_A, { records });
    const huge = b64(envelope(7, Math.floor(MAX_ENVELOPE_BYTES / 256)));
    for (const records of [
      [],
      [{ ...rec(id, 1), ciphertext: huge }],
      [{ ...rec(id, 1), ciphertext: b64(new Uint8Array(300).fill(1)) }],
      [{ ...rec(id, 1), ciphertext: "not base64!" }],
      [rec(id, 1), rec(id, 1)],
      [rec(id.toUpperCase(), 1)],
      [rec(id, 0)],
      [rec(id, 1.5)],
      [{ ...rec(id, 1), deleted: "no" }],
      [{ ...rec(id, 1), type: "account" }],
      Array.from({ length: 101 }, (_, i) =>
        rec(`2a000000-0000-4000-8000-${String(i).padStart(12, "0")}`, 1),
      ),
      "records",
    ])
      expect((await bad(records)).status).toBe(400);
    expect(
      (await push(ASHA, HH_A, { records: [rec(id, 1)], extra: 1 })).status,
    ).toBe(400);
    expect((await push(ASHA, HH_A, "{")).status).toBe(400);
    expect(
      (
        await push(
          ASHA,
          HH_A,
          { records: [rec(id, 1)] },
          { "content-type": "text/plain" },
        )
      ).status,
    ).toBe(415);
    expect(
      (await push(ASHA, HH_A, `{"records":"${"x".repeat(4 * 1024 * 1024)}"}`))
        .status,
    ).toBe(413);
    expect((await push(null, HH_A, { records: [rec(id, 1)] })).status).toBe(
      401,
    );
    expect(await recordSeq(HH_A)).toBe(4);
  });

  it("never gives concurrent pushes the same seq", async () => {
    const ids = (p: number) =>
      [0, 1, 2].map(
        (i) => `3a000000-0000-4000-8000-${`${p}${i}`.padStart(12, "0")}`,
      );
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((p) =>
        pushOk(
          ASHA,
          HH_A,
          ids(p).map((id) => rec(id, 1)),
        ),
      ),
    );
    const seqs = results.flatMap((r) => r.applied.map((a) => a.seq));
    expect(new Set(seqs).size).toBe(15);
    expect([...seqs].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 15 }, (_, i) => 5 + i),
    );
    expect(await recordSeq(HH_A)).toBe(19);
  });
});
