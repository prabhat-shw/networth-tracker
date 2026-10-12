import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIRST_KID, type HouseholdKey } from "@/crypto/household";
import { generateDataKey, generateIdentityKeyPair } from "@/crypto/keys";
import { createKeySession } from "@/features/lock/key-session";
import { type FakeServer, fakeServer, memoryStore } from "./fakes";
import { type HouseholdSync, startHouseholdSync } from "./household-sync";
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
  { clock = "10:00:00", store = memoryStore() } = {},
) {
  const session = createKeySession({ autoLockMs: 3_600_000 });
  session.start(await generateIdentityKeyPair());
  session.setHouseholdKey(hdk);
  const transport = server.connect();
  const env = quietEnv();
  const at = { clock };
  const sync = startHouseholdSync({
    session,
    userId,
    transport,
    store,
    env,
    now: () => new Date(`2026-10-12T${at.clock}.000Z`),
  });
  await vi.waitFor(() => expect(env.timers).toBe(1)); // hydrated, scheduler running
  return { session, transport, env, sync, store, at };
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

  it("refuses to start without a household key", async () => {
    const session = createKeySession();
    session.start(await generateIdentityKeyPair());
    expect(() =>
      startHouseholdSync({ session, userId: ASHA, env: quietEnv() }),
    ).toThrow(/household key/);
  });
});
