/**
 * The unlocked session (ADR-0024). Keys live only in this module's closure, never in React
 * state, storage or a request: `state()` is a plain status snapshot the UI can render.
 * Locking drops every key reference. JS cannot zero a CryptoKey, but once nothing refers
 * to it the key is unreachable, and the private key was non-extractable to begin with.
 *
 * Right after a passphrase unlock the session can add one passkey slot (ADR-0034): the
 * passphrase stays in this closure for at most `ENROL_WINDOW_MS`, and is dropped on lock,
 * on use or on dismissal. It is never in React state, storage or a request.
 */
import type { HouseholdKey } from "@/crypto/household";
import {
  addPasskeySlot,
  type IdentityVault,
  type UnlockedIdentity,
  unlockWithPassphrase,
} from "@/crypto/vault";
import { type PasskeyPrf, unlockWithPasskey } from "@/crypto/vault-passkey";

export const DEFAULT_AUTO_LOCK_MS = 5 * 60_000;
export const ENROL_WINDOW_MS = 2 * 60_000;

export type LockStatus = "locked" | "unlocking" | "failed" | "unlocked";

export interface KeySession {
  /** Plain status for rendering; holds no keys. Same object until the status changes. */
  state(): { status: LockStatus };
  subscribe(listener: () => void): () => void;
  /** Resolves true on success; a wrong passphrase leaves the session locked ("failed"). */
  unlock(vault: IdentityVault, passphrase: string): Promise<boolean>;
  /** Same, with a passkey's PRF output (ADR-0033). */
  unlockWithPasskey(vault: IdentityVault, prf: PasskeyPrf): Promise<boolean>;
  /** True for a short while after a passphrase unlock (ADR-0034). */
  canEnrolPasskey(): boolean;
  /** Adds a passkey slot to the vault just unlocked; the capability is then used up. */
  enrolPasskey(prf: PasskeyPrf): Promise<IdentityVault>;
  dismissEnrol(): void;
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
  unlockPasskey?: typeof unlockWithPasskey;
  addSlot?: typeof addPasskeySlot;
}

export function createKeySession({
  autoLockMs = DEFAULT_AUTO_LOCK_MS,
  now = Date.now,
  unlockVault = unlockWithPassphrase,
  unlockPasskey = unlockWithPasskey,
  addSlot = addPasskeySlot,
}: KeySessionOptions = {}): KeySession {
  let snapshot: { status: LockStatus } = { status: "locked" };
  let identity: UnlockedIdentity | null = null;
  let household: HouseholdKey | null = null;
  let lastActivity = 0;
  let enrol: {
    vault: IdentityVault;
    passphrase: string;
    until: number;
  } | null = null;
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
    enrol = null;
    set("locked");
  }

  /** `opened` runs before listeners hear "unlocked", so they see its effects. */
  async function open(
    opener: () => Promise<UnlockedIdentity>,
    opened?: () => void,
  ) {
    const mine = ++generation;
    identity = null;
    household = null;
    enrol = null;
    set("unlocking");
    let unlocked: UnlockedIdentity;
    try {
      unlocked = await opener();
    } catch {
      if (mine === generation) set("failed");
      return false;
    }
    if (mine !== generation) return false;
    identity = unlocked;
    opened?.();
    schedule();
    set("unlocked");
    return true;
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
    unlock: (vault, passphrase) =>
      open(
        () => unlockVault(vault, passphrase),
        () => {
          enrol = { vault, passphrase, until: now() + ENROL_WINDOW_MS };
        },
      ),
    unlockWithPasskey: (vault, prf) => open(() => unlockPasskey(vault, prf)),
    canEnrolPasskey: () =>
      enrol !== null && snapshot.status === "unlocked" && now() < enrol.until,
    async enrolPasskey(prf) {
      const pending = enrol;
      if (!pending || snapshot.status !== "unlocked" || now() >= pending.until)
        throw new Error("passkey enrolment is not available");
      const next = await addSlot(pending.vault, pending.passphrase, prf);
      if (enrol === pending) enrol = null;
      return next;
    },
    dismissEnrol() {
      enrol = null;
    },
    start(unlocked) {
      generation++;
      identity = unlocked;
      household = null;
      enrol = null;
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
