import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIRST_KID, type HouseholdKey } from "@/crypto/household";
import { generateDataKey, generateIdentityKeyPair } from "@/crypto/keys";
import { memoryPriceStore } from "@/db/price-store";
import { createKeySession } from "@/features/lock/key-session";
import { type FakeServer, fakeServer, memoryStore } from "./fakes";
import { type HouseholdSync, startHouseholdSync } from "./household-sync";
import { SyncHttpError } from "./http-transport";
import type { SyncEnv } from "./scheduler";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const R1 = "1a000000-0000-4000-8000-000000000001";

let hdk: HouseholdKey;
let server: FakeServer;

beforeEach(async () => {
  hdk = { householdId: "hh", kid: FIRST_KID, key: await generateDataKey() };
  server = fakeServer();
});

function quietEnv(): SyncEnv & { online(): void; timers: number } {
  const online = new Set<() => void>();
  const env = {
    timers: 0,
    addEventListener(type: string, fn: () => void) {
      if (type === "online") online.add(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      if (type === "online") online.delete(fn);
    },
    visible: () => true,
    setInterval: () => {
      env.timers++;
      return 1;
    },
    clearInterval: () => {
      env.timers--;
    },
    online() {
      for (const fn of online) fn();
    },
  };
  return env;
}

async function device(
  userId: string,
  {
    clock = "10:00:00",
    store = memoryStore(),
    transport = server.connect(),
    prices = {
      refresh: vi.fn(async () => ({ day: "", outcomes: {} as never })),
    },
  } = {},
) {
  const session = createKeySession({ autoLockMs: 3_600_000 });
  session.start(await generateIdentityKeyPair());
  session.setHouseholdKey(hdk);
  const env = quietEnv();
  const at = { clock };
  const sync = startHouseholdSync({
    session,
    userId,
    transport,
    store,
    prices,
    env,
    now: () => new Date(`2026-10-12T${at.clock}.000Z`),
  });
  await vi.waitFor(() => expect(env.timers).toBe(1)); // hydrated, scheduler running
  return { session, transport, env, sync, store, at, prices };
}

const texts = (s: HouseholdSync) =>
  s.records().map((r) => (r.data as { text: string }).text);

describe("household sync", () => {
  it("stamps edits with the member and moves them to another device", async () => {
    const a = await device(ASHA);
    const b = await device(BALA);
    const written = await a.sync.write(R1, "note", { text: "hello" });
    expect(written).toMatchObject({ modifiedBy: ASHA, schemaVersion: 1 });
    expect(texts(a.sync)).toEqual(["hello"]);
    await a.sync.sync();
    await b.sync.sync();
    expect(texts(b.sync)).toEqual(["hello"]);
    expect(b.sync.records()[0].modifiedBy).toBe(ASHA);
  });

  it("queues offline, pushes on `online`, and resolves a conflict LWW on both", async () => {
    const a = await device(ASHA);
    const b = await device(BALA, { clock: "10:00:05" });
    await a.sync.write(R1, "note", { text: "v1" });
    await a.sync.sync();
    await b.sync.sync();

    a.transport.offline();
    b.transport.offline();
    a.at.clock = "10:01:00";
    b.at.clock = "10:02:00"; // later: B's edit wins
    await a.sync.write(R1, "note", { text: "from A" });
    await b.sync.write(R1, "note", { text: "from B" });
    a.transport.online();
    b.transport.online();
    a.env.online();
    await vi.waitFor(() => expect(server.rows.get(R1)?.version).toBe(2));
    await b.sync.sync();
    await a.sync.sync();
    expect(texts(a.sync)).toEqual(["from B"]);
    expect(texts(b.sync)).toEqual(["from B"]);
  });

  it("propagates a delete", async () => {
    const a = await device(ASHA);
    const b = await device(BALA);
    await a.sync.write(R1, "note", { text: "gone soon" });
    await a.sync.sync();
    await b.sync.sync();
    await b.sync.write(R1, "note", { text: "gone soon" }, true);
    await b.sync.sync();
    await a.sync.sync();
    expect(a.sync.records()).toEqual([]);
    expect(server.rows.get(R1)?.deleted).toBe(true);
  });

  it("hydrates from the store, and drops plaintext and listeners on lock and stop", async () => {
    const store = memoryStore();
    const a = await device(ASHA, { store });
    await a.sync.write(R1, "note", { text: "kept" });
    a.sync.stop();
    expect(a.sync.records()).toEqual([]);

    const again = await device(ASHA, { store });
    expect(texts(again.sync)).toEqual(["kept"]);
    const heard = vi.fn();
    again.sync.subscribe(heard);
    again.session.lock();
    expect(again.sync.records()).toEqual([]);
    expect(heard).toHaveBeenCalled();
    expect(again.env.timers).toBe(0); // scheduler stopped with the lock
  });

  it("reports synced, offline and the time of the last clean run", async () => {
    const a = await device(ASHA);
    await vi.waitFor(() => expect(a.sync.status().state).toBe("synced"));
    expect(a.sync.status()).toMatchObject({ pending: false });
    expect(a.sync.status().lastSyncedAt?.toISOString()).toBe(
      "2026-10-12T10:00:00.000Z",
    );

    a.transport.offline();
    a.at.clock = "10:05:00";
    await a.sync.write(R1, "note", { text: "later" });
    await vi.waitFor(() => expect(a.sync.status().state).toBe("offline"));
    expect(a.sync.status().pending).toBe(true);
    expect(a.sync.status().lastSyncedAt?.toISOString()).toBe(
      "2026-10-12T10:00:00.000Z",
    );

    a.transport.online();
    await a.sync.sync();
    expect(a.sync.status()).toMatchObject({ state: "synced", pending: false });
  });

  it("says edits are waiting when a push needs a recovery method (409)", async () => {
    const base = server.connect();
    const transport = Object.assign(base, {
      push: async () => {
        throw new SyncHttpError(409);
      },
    });
    const a = await device(ASHA, { transport });
    await a.sync.write(R1, "note", { text: "stuck" });
    await vi.waitFor(() => expect(a.sync.status().state).toBe("recovery"));
    expect(a.sync.status().pending).toBe(true);
    expect(texts(a.sync)).toEqual(["stuck"]); // still shown locally
  });

  it("refreshes prices on the scheduler's triggers, not on a local write", async () => {
    const a = await device(ASHA);
    await vi.waitFor(() => expect(a.prices.refresh).toHaveBeenCalledTimes(1));
    a.env.online();
    expect(a.prices.refresh).toHaveBeenCalledTimes(2);
    await a.sync.write(R1, "account", { name: "PPF" });
    expect(a.prices.refresh).toHaveBeenCalledTimes(2);
  });

  it("loads the cached price universes from its store after hydrate", async () => {
    const store = memoryPriceStore();
    await store.put({
      kind: "amfi",
      universe: {
        kind: "amfi",
        date: "2026-10-11",
        fetchedAt: "2026-10-11T18:00:00.000Z",
        source: "fixture",
        currency: "INR",
        prices: { "119551": "29.7532" },
      },
      etag: null,
      checkedOn: "2026-10-12",
    });
    // The refresher it builds finds nothing to fetch: amfi is checked, others fail offline.
    const a = await device(ASHA, { prices: store as never });
    await vi.waitFor(() =>
      expect(a.sync.universes().amfi?.prices["119551"]).toBe("29.7532"),
    );
    expect(a.sync.universes()).toBe(a.sync.universes());
  });

  it("keeps the status object stable between changes", async () => {
    const a = await device(ASHA);
    await vi.waitFor(() => expect(a.sync.status().state).toBe("synced"));
    expect(a.sync.status()).toBe(a.sync.status());
  });

  it("refuses to start without a household key", async () => {
    const session = createKeySession();
    session.start(await generateIdentityKeyPair());
    expect(() =>
      startHouseholdSync({ session, userId: ASHA, env: quietEnv() }),
    ).toThrow(/household key/);
  });
});
