/**
 * The unlocked session (ADR-0024). Keys live only in this module's closure, never in React
 * state, storage or a request: `state()` is a plain status snapshot the UI can render.
 * Locking drops every key reference. JS cannot zero a CryptoKey, but once nothing refers
 * to it the key is unreachable, and the private key was non-extractable to begin with.
 */
import type { HouseholdKey } from "@/crypto/household";
import {
  type IdentityVault,
  type UnlockedIdentity,
  unlockWithPassphrase,
} from "@/crypto/vault";

export const DEFAULT_AUTO_LOCK_MS = 5 * 60_000;

export type LockStatus = "locked" | "unlocking" | "failed" | "unlocked";

export interface KeySession {
  /** Plain status for rendering; holds no keys. Same object until the status changes. */
  state(): { status: LockStatus };
  subscribe(listener: () => void): () => void;
  /** Resolves true on success; a wrong passphrase leaves the session locked ("failed"). */
  unlock(vault: IdentityVault, passphrase: string): Promise<boolean>;
  /** Starts unlocked with an identity just created or restored on this device (#53, #54). */
  start(identity: UnlockedIdentity): void;
  lock(): void;
  /** User activity: restarts the inactivity window, or locks if it already ran out. */
  touch(): void;
  /** Locks if the inactivity window ran out (a throttled timer or a sleeping laptop). */
  check(): void;
  identity(): UnlockedIdentity | null;
  householdKey(): HouseholdKey | null;
  setHouseholdKey(key: HouseholdKey): void;
}

export interface KeySessionOptions {
  autoLockMs?: number;
  now?: () => number;
  unlockVault?: typeof unlockWithPassphrase;
}

export function createKeySession({
  autoLockMs = DEFAULT_AUTO_LOCK_MS,
  now = Date.now,
  unlockVault = unlockWithPassphrase,
}: KeySessionOptions = {}): KeySession {
  let snapshot: { status: LockStatus } = { status: "locked" };
  let identity: UnlockedIdentity | null = null;
  let household: HouseholdKey | null = null;
  let lastActivity = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Bumped on every lock, so an unlock still deriving when the session locks is discarded.
  let generation = 0;
  const listeners = new Set<() => void>();

  const set = (status: LockStatus) => {
    if (snapshot.status === status) return;
    snapshot = { status };
    for (const listener of listeners) listener();
  };

  const schedule = () => {
    clearTimeout(timer);
    lastActivity = now();
    timer = setTimeout(check, autoLockMs);
  };

  function lock() {
    generation++;
    clearTimeout(timer);
    timer = undefined;
    identity = null;
    household = null;
    set("locked");
  }

  function check() {
    if (snapshot.status !== "unlocked") return;
    if (now() - lastActivity >= autoLockMs) lock();
    else {
      clearTimeout(timer);
      timer = setTimeout(check, autoLockMs - (now() - lastActivity));
    }
  }

  return {
    state: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async unlock(vault, passphrase) {
      const mine = ++generation;
      identity = null;
      household = null;
      set("unlocking");
      let unlocked: UnlockedIdentity;
      try {
        unlocked = await unlockVault(vault, passphrase);
      } catch {
        if (mine === generation) set("failed");
        return false;
      }
      if (mine !== generation) return false;
      identity = unlocked;
      schedule();
      set("unlocked");
      return true;
    },
    start(unlocked) {
      generation++;
      identity = unlocked;
      household = null;
      schedule();
      set("unlocked");
    },
    lock,
    touch() {
      if (snapshot.status !== "unlocked") return;
      if (now() - lastActivity >= autoLockMs) lock();
      else schedule();
    },
    check,
    identity: () => identity,
    householdKey: () => household,
    setHouseholdKey(key) {
      if (!identity) throw new Error("session is locked");
      household = key;
    },
  };
}

const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Wires a session to the page: activity restarts the timer; returning to the tab checks
 * it; `pagehide` locks, because the back/forward cache can otherwise restore the page
 * with the keys still in memory. Returns the uninstaller.
 */
export function installAutoLock(session: KeySession, win: Window): () => void {
  const touch = () => session.touch();
  const check = () => {
    if (win.document.visibilityState === "visible") session.check();
  };
  const lock = () => session.lock();
  for (const type of ACTIVITY)
    win.addEventListener(type, touch, { passive: true, capture: true });
  win.document.addEventListener("visibilitychange", check);
  win.addEventListener("pagehide", lock);
  return () => {
    for (const type of ACTIVITY)
      win.removeEventListener(type, touch, { capture: true });
    win.document.removeEventListener("visibilitychange", check);
    win.removeEventListener("pagehide", lock);
  };
}

/** The app's one session. Created lazily-cheap: nothing runs until `unlock`. */
export const keySession = createKeySession();
