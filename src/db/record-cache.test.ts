import { describe, expect, it } from "vitest";
import { generateIdentityKeyPair } from "@/crypto/keys";
import type { PlainRecord } from "@/crypto/record-codec";
import { createKeySession } from "@/features/lock/key-session";
import { createRecordCache } from "./record-cache";

const record = (id: string): PlainRecord => ({
  id,
  version: 1,
  deleted: false,
  type: "account",
  schemaVersion: 1,
  data: { name: "PPF" },
  modifiedAt: "2026-10-12T10:00:00.000Z",
  modifiedBy: "0a000000-0000-4000-8000-0000000000a1",
});

const unlockedSession = async (autoLockMs = 60_000, now = () => 0) => {
  const session = createKeySession({ autoLockMs, now });
  session.start(await generateIdentityKeyPair());
  expect(session.state().status).toBe("unlocked");
  return session;
};

describe("record cache", () => {
  it("holds decrypted records while unlocked and empties on lock", async () => {
    const session = await unlockedSession();
    const cache = createRecordCache(session);
    cache.set(record("r1"));
    cache.set(record("r2"));
    expect(cache.size()).toBe(2);
    expect(cache.get("r1")?.data).toEqual({ name: "PPF" });

    session.lock();
    expect(cache.size()).toBe(0);
    expect(cache.all()).toEqual([]);
  });

  it("empties on auto-lock", async () => {
    let t = 0;
    const session = await unlockedSession(1000, () => t);
    const cache = createRecordCache(session);
    cache.set(record("r1"));
    t = 2000;
    session.check();
    expect(session.state().status).toBe("locked");
    expect(cache.size()).toBe(0);
  });

  it("refuses records while locked, so a late decrypt cannot refill it", async () => {
    const session = await unlockedSession();
    const cache = createRecordCache(session);
    session.lock();
    cache.set(record("late"));
    expect(cache.size()).toBe(0);
  });

  it("stops following the session once disposed", async () => {
    const session = await unlockedSession();
    const cache = createRecordCache(session);
    cache.set(record("r1"));
    cache.dispose();
    expect(cache.size()).toBe(0);
    session.lock(); // no listener left to throw or leak
  });
});
