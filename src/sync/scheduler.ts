/**
 * When sync runs (ADR-0049): once right after unlock, whenever the browser comes back
 * online, and every `intervalMs` while the page is visible. Locking stops it and drops the
 * timer; a run already in flight finishes, but the engine then sees no key and stops.
 * Errors (offline, server down) are reported and retried on the next trigger.
 */
import type { KeySession } from "@/features/lock/key-session";
import type { SyncEngine, SyncResult } from "./engine";

export const DEFAULT_SYNC_INTERVAL_MS = 60_000;

/** The browser surface the scheduler needs, injectable for tests. */
export interface SyncEnv {
  addEventListener(type: "online" | "visibilitychange", fn: () => void): void;
  removeEventListener(
    type: "online" | "visibilitychange",
    fn: () => void,
  ): void;
  visible(): boolean;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const browserEnv = (): SyncEnv => ({
  addEventListener: (type, fn) =>
    (type === "online" ? window : document).addEventListener(type, fn),
  removeEventListener: (type, fn) =>
    (type === "online" ? window : document).removeEventListener(type, fn),
  visible: () => document.visibilityState === "visible",
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (h) => window.clearInterval(h as number),
});

export interface SchedulerOptions {
  session: Pick<KeySession, "state" | "subscribe">;
  engine: Pick<SyncEngine, "sync">;
  env: SyncEnv;
  intervalMs?: number;
  onResult?: (result: SyncResult) => void;
  onError?: (error: unknown) => void;
}

/** Starts following the session; returns a function that stops everything. */
export function startSyncScheduler({
  session,
  engine,
  env,
  intervalMs = DEFAULT_SYNC_INTERVAL_MS,
  onResult,
  onError,
}: SchedulerOptions): () => void {
  let timer: unknown = null;
  const unlocked = () => session.state().status === "unlocked";

  const kick = () => {
    if (!unlocked()) return;
    engine.sync().then(onResult, onError);
  };
  const tick = () => {
    if (env.visible()) kick();
  };
  const onVisible = () => {
    if (env.visible()) kick();
  };

  const start = () => {
    if (timer !== null) return;
    timer = env.setInterval(tick, intervalMs);
    env.addEventListener("online", kick);
    env.addEventListener("visibilitychange", onVisible);
    kick();
  };
  const stop = () => {
    if (timer === null) return;
    env.clearInterval(timer);
    timer = null;
    env.removeEventListener("online", kick);
    env.removeEventListener("visibilitychange", onVisible);
  };

  const follow = () => (unlocked() ? start() : stop());
  const unsubscribe = session.subscribe(follow);
  follow();
  return () => {
    unsubscribe();
    stop();
  };
}
