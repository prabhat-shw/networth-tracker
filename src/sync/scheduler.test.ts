import { describe, expect, it, vi } from "vitest";
import { generateIdentityKeyPair } from "@/crypto/keys";
import { createKeySession } from "@/features/lock/key-session";
import type { SyncResult } from "./engine";
import { type SyncEnv, startSyncScheduler } from "./scheduler";

const RESULT: SyncResult = {
  pulled: 0,
  pushed: 0,
  conflicts: 0,
  rejected: 0,
  pending: false,
};

function fakeEnv() {
  const listeners = new Map<string, Set<() => void>>();
  let tick: (() => void) | null = null;
  const env: SyncEnv & {
    fire(type: string): void;
    tick(): void;
    hidden: boolean;
    timers: number;
  } = {
    hidden: false,
    timers: 0,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    visible: () => !env.hidden,
    setInterval(fn) {
      env.timers++;
      tick = fn;
      return 1;
    },
    clearInterval() {
      env.timers--;
      tick = null;
    },
    fire(type) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    tick() {
      tick?.();
    },
  };
  return env;
}

async function setup() {
  const session = createKeySession({ autoLockMs: 3_600_000 });
  const engine = { sync: vi.fn(async () => RESULT) };
  const env = fakeEnv();
  const onError = vi.fn();
  const stop = startSyncScheduler({ session, engine, env, onError });
  return { session, engine, env, stop, onError };
}

describe("sync scheduler", () => {
  it("does nothing while locked, then syncs right after unlock", async () => {
    const { session, engine, env } = await setup();
    env.fire("online");
    env.tick();
    expect(engine.sync).not.toHaveBeenCalled();
    session.start(await generateIdentityKeyPair());
    expect(engine.sync).toHaveBeenCalledTimes(1);
  });

  it("syncs on online, on the interval while visible, and when the page becomes visible", async () => {
    const { session, engine, env } = await setup();
    session.start(await generateIdentityKeyPair());
    env.fire("online");
    env.tick();
    expect(engine.sync).toHaveBeenCalledTimes(3);
    env.hidden = true;
    env.tick();
    env.fire("visibilitychange");
    expect(engine.sync).toHaveBeenCalledTimes(3);
    env.hidden = false;
    env.fire("visibilitychange");
    expect(engine.sync).toHaveBeenCalledTimes(4);
  });

  it("stops on lock and on stop(), leaving no timer or listener behind", async () => {
    const { session, engine, env, stop } = await setup();
    session.start(await generateIdentityKeyPair());
    expect(env.timers).toBe(1);
    session.lock();
    expect(env.timers).toBe(0);
    env.fire("online");
    env.tick();
    expect(engine.sync).toHaveBeenCalledTimes(1);

    session.start(await generateIdentityKeyPair());
    expect(env.timers).toBe(1);
    stop();
    expect(env.timers).toBe(0);
    env.fire("online");
    expect(engine.sync).toHaveBeenCalledTimes(2);
  });

  it("reports a failed run and keeps going", async () => {
    const { session, engine, env, onError } = await setup();
    engine.sync.mockRejectedValueOnce(new TypeError("offline"));
    session.start(await generateIdentityKeyPair());
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    env.fire("online");
    expect(engine.sync).toHaveBeenCalledTimes(2);
  });
});
