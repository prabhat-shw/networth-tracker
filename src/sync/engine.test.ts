import { beforeEach, describe, expect, it } from "vitest";
import { FIRST_KID, type HouseholdKey } from "@/crypto/household";
import { generateDataKey, generateIdentityKeyPair } from "@/crypto/keys";
import type { RecordContent } from "@/crypto/record-codec";
import type { LocalStore } from "@/db/local-store";
import { createRecordCache, type RecordCache } from "@/db/record-cache";
import { createKeySession, type KeySession } from "@/features/lock/key-session";
import {
  createSyncEngine,
  LockedError,
  PULL_PAGE,
  type SyncEngine,
} from "./engine";
import { type FakeServer, fakeServer, memoryStore } from "./fakes";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const R1 = "1a000000-0000-4000-8000-000000000001";
const R2 = "1a000000-0000-4000-8000-000000000002";

let hdk: HouseholdKey;
let server: FakeServer;

beforeEach(async () => {
  hdk = { householdId: "hh", kid: FIRST_KID, key: await generateDataKey() };
  server = fakeServer();
});

interface Device {
  session: KeySession;
  store: LocalStore;
  cache: RecordCache;
  transport: ReturnType<FakeServer["connect"]>;
  engine: SyncEngine;
}

async function device(store: LocalStore = memoryStore()): Promise<Device> {
  const session = createKeySession({ autoLockMs: 3_600_000 });
  session.start(await generateIdentityKeyPair());
  session.setHouseholdKey(hdk);
  const cache = createRecordCache(session);
  const transport = server.connect();
  const engine = createSyncEngine({
    transport,
    store,
    cache,
    hdk: () => session.householdKey(),
  });
  return { session, store, cache, transport, engine };
}

const content = (name: string, at: string, by = ASHA): RecordContent => ({
  type: "account",
  schemaVersion: 1,
  data: { name },
  modifiedAt: `2026-10-12T${at}.000Z`,
  modifiedBy: by,
});

const view = (d: Device) =>
  d.cache
    .all()
    .map((r) => [r.id, (r.data as { name: string }).name, r.version])
    .sort();

describe("sync engine", () => {
  it("moves a write from one device to another", async () => {
    const a = await device();
    const b = await device();
    await a.engine.write(R1, content("PPF", "10:00:00"));
    expect(await a.engine.sync()).toMatchObject({ pushed: 1, pending: false });
    expect(await b.engine.sync()).toMatchObject({ pulled: 1 });
    expect(view(b)).toEqual([[R1, "PPF", 1]]);
    expect(await a.store.outbox()).toEqual([]);
  });

  it("converges after offline edits on both devices (LWW, later edit wins)", async () => {
    const a = await device();
    const b = await device();
    await a.engine.write(R1, content("PPF", "09:00:00"));
    await a.engine.sync();
    await b.engine.sync();

    a.transport.offline();
    b.transport.offline();
    await a.engine.write(R1, content("PPF (Asha)", "10:00:00", ASHA));
    await b.engine.write(R1, content("PPF (Bala)", "11:00:00", BALA)); // later
    await a.engine.write(R2, content("FD", "10:30:00", ASHA));
    await expect(a.engine.sync()).rejects.toThrow("offline");
    a.transport.online();
    b.transport.online();

    // A pushes first; B's edit then conflicts, wins on time, and is re-sealed on top.
    await a.engine.sync();
    const rb = await b.engine.sync();
    expect(rb.conflicts).toBe(0); // B learned A's version on pull, before pushing
    expect(rb.pushed).toBe(1);
    await a.engine.sync();

    const expected = [
      [R1, "PPF (Bala)", 3],
      [R2, "FD", 1],
    ];
    expect(view(a)).toEqual(expected);
    expect(view(b)).toEqual(expected);
    expect(server.rows.get(R1)?.version).toBe(3);
  });

  it("drops a losing offline edit and shows the winner", async () => {
    const a = await device();
    const b = await device();
    await a.engine.write(R1, content("PPF", "09:00:00"));
    await a.engine.sync();
    await b.engine.sync();
    await b.engine.write(R1, content("stale", "08:00:00", BALA)); // older clock
    await a.engine.write(R1, content("fresh", "10:00:00"));
    await a.engine.sync();
    await b.engine.sync();
    expect(await b.store.outbox()).toEqual([]);
    expect(view(b)).toEqual([[R1, "fresh", 2]]);
  });

  it("resolves a push conflict it did not see on pull, then converges", async () => {
    const a = await device();
    const b = await device();
    await a.engine.write(R1, content("v1", "09:00:00"));
    await a.engine.sync();
    await b.engine.sync();
    await b.engine.write(R1, content("bala", "11:00:00", BALA));
    // A's write lands between B's pull and B's push: simulate by pushing A first, then
    // letting B push without pulling (its cursor is behind, the server answers a conflict).
    await a.engine.write(R1, content("asha", "10:00:00"));
    await a.engine.sync();
    const push = await b.transport.push((await b.store.outbox()).map((o) => o));
    expect(push.conflicts).toHaveLength(1);
    const rb = await b.engine.sync();
    expect(rb.pending).toBe(false);
    await a.engine.sync();
    expect(view(a)).toEqual([[R1, "bala", 3]]);
    expect(view(b)).toEqual(view(a));
  });

  it("propagates a delete as a tombstone that is never held as plaintext", async () => {
    const a = await device();
    const b = await device();
    await a.engine.write(R1, content("PPF", "09:00:00"));
    await a.engine.write(R2, content("FD", "09:00:00"));
    await a.engine.sync();
    await b.engine.sync();

    // B edits offline (older clock) before it has seen A's delete: the delete wins.
    await b.engine.write(R1, content("PPF edit", "09:30:00", BALA));
    await a.engine.write(R1, content("PPF", "10:00:00"), true);
    expect(a.cache.get(R1)).toBeUndefined();
    await a.engine.sync();
    await b.engine.sync();
    expect(await b.store.outbox()).toEqual([]);
    expect(view(b)).toEqual([[R2, "FD", 1]]);
    expect((await b.store.envelope(R1))?.deleted).toBe(true);

    // An edit made after seeing the delete builds on the tombstone: it revives the record
    // on both devices.
    await b.engine.write(R1, content("PPF again", "12:00:00", BALA));
    await b.engine.sync();
    await a.engine.sync();
    expect(view(a)).toEqual(view(b));
    expect(a.cache.get(R1)).toMatchObject({
      version: 3,
      data: { name: "PPF again" },
    });
  });

  it("bounds conflict retries and finishes on a later run", async () => {
    const a = await device();
    await a.engine.write(R1, content("v1", "09:00:00"));
    await a.engine.sync();
    await a.engine.write(R1, content("v2", "10:00:00"));
    server.forceConflicts = 100;
    a.transport.calls = 0;
    const r = await a.engine.sync();
    expect(r).toMatchObject({ pending: true, pushed: 0, conflicts: 3 });
    expect(a.transport.calls).toBe(1 + 3); // one pull, three push rounds
    server.forceConflicts = 0;
    expect(await a.engine.sync()).toMatchObject({ pending: false, pushed: 1 });
    expect(server.rows.get(R1)?.version).toBe(2);
  });

  it("skips envelopes that fail to decrypt, without storing them", async () => {
    const a = await device();
    const b = await device();
    await a.engine.write(R1, content("PPF", "09:00:00"));
    await a.engine.sync();
    const row = server.rows.get(R1);
    if (!row) throw new Error("missing");
    row.ciphertext = row.ciphertext.slice();
    row.ciphertext[row.ciphertext.length - 1] ^= 1;
    expect(await b.engine.sync()).toMatchObject({ pulled: 0, rejected: 1 });
    expect(b.cache.size()).toBe(0);
    expect(await b.store.envelope(R1)).toBeUndefined();
    expect(await b.store.cursor()).toBe(1);
  });

  it("pages pulls and batches pushes", async () => {
    const a = await device();
    const b = await device();
    const n = PULL_PAGE + 1;
    for (let i = 0; i < n; i++)
      await a.engine.write(
        `2a000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        content(`r${i}`, "09:00:00"),
      );
    expect(await a.engine.sync()).toMatchObject({ pushed: n });
    expect(await b.engine.sync()).toMatchObject({ pulled: n });
    expect(b.cache.size()).toBe(n);
  });

  it("shares one run between concurrent calls, and stops when locked", async () => {
    const a = await device();
    await a.engine.write(R1, content("PPF", "09:00:00"));
    const [x, y] = [a.engine.sync(), a.engine.sync()];
    expect(x).toBe(y);
    await x;
    a.session.lock();
    expect(a.cache.size()).toBe(0);
    await expect(a.engine.sync()).rejects.toBeInstanceOf(LockedError);
    await expect(
      a.engine.write(R2, content("x", "09:00:00")),
    ).rejects.toBeInstanceOf(LockedError);
  });

  it("hydrates the cache from the store after an unlock, pending edits included", async () => {
    const store = memoryStore();
    const a = await device(store);
    await a.engine.write(R1, content("PPF", "09:00:00"));
    await a.engine.write(R2, content("gone", "09:00:00"), true);
    await a.engine.sync();
    a.transport.offline();
    await a.engine.write(R1, content("PPF edited", "10:00:00"));
    a.session.lock();

    const again = await device(store);
    await again.engine.hydrate();
    expect(view(again)).toEqual([[R1, "PPF edited", 2]]);
  });
});
