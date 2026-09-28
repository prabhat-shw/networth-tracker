import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DecryptError } from "@/crypto/aead";
import { createHousehold } from "@/crypto/household";
import { generateIdentityKeyPair } from "@/crypto/keys";
import {
  createIdentity,
  type IdentityVault,
  type UnlockedIdentity,
} from "@/crypto/vault";
import type { PasskeyPrf } from "@/crypto/vault-passkey";
import {
  createKeySession,
  DEFAULT_AUTO_LOCK_MS,
  ENROL_WINDOW_MS,
  installAutoLock,
  type KeySession,
} from "./key-session";

const MIN = 60_000;
const vault = {} as IdentityVault; // the fake unlocker ignores it

/** Walks everything reachable from `root` and reports whether a CryptoKey is among it. */
function reachesKey(root: unknown, seen = new Set<unknown>()): boolean {
  if (root instanceof CryptoKey) return true;
  if (typeof root !== "object" || root === null || seen.has(root)) return false;
  seen.add(root);
  return Object.values(root).some((v) => reachesKey(v, seen));
}

let clock: number;
let identity: UnlockedIdentity;
let session: KeySession;

beforeEach(async () => {
  vi.useFakeTimers();
  clock = 0;
  identity = await generateIdentityKeyPair();
  session = createKeySession({
    now: () => clock,
    unlockVault: async (_v, passphrase) => {
      if (passphrase !== "right") throw new DecryptError();
      return identity;
    },
  });
});
afterEach(() => vi.useRealTimers());

const advance = (ms: number) => {
  clock += ms;
  vi.advanceTimersByTime(ms);
};

describe("key session", () => {
  it("starts locked and exposes no keys", () => {
    expect(session.state()).toEqual({ status: "locked" });
    expect(session.identity()).toBeNull();
    expect(() => session.setHouseholdKey({} as never)).toThrow(/locked/);
  });

  it("unlocks, and a wrong passphrase leaves it locked with nothing usable", async () => {
    expect(await session.unlock(vault, "wrong")).toBe(false);
    expect(session.state().status).toBe("failed");
    expect(session.identity()).toBeNull();
    expect(await session.unlock(vault, "right")).toBe(true);
    expect(session.state().status).toBe("unlocked");
    expect(session.identity()).toBe(identity);
  });

  it("wipes every key reference on lock (#7 acceptance)", async () => {
    await session.unlock(vault, "right");
    session.setHouseholdKey((await createHousehold(identity)).household);
    expect(reachesKey(session.householdKey())).toBe(true);

    session.lock();
    expect(session.identity()).toBeNull();
    expect(session.householdKey()).toBeNull();
    expect(reachesKey(session.state())).toBe(false);
    expect(reachesKey(session)).toBe(false);
  });

  it("never keeps the keys of an unlock that finished after a lock", async () => {
    const pending = session.unlock(vault, "right");
    session.lock(); // e.g. pagehide while Argon2id was still running
    expect(await pending).toBe(false);
    expect(session.state().status).toBe("locked");
    expect(session.identity()).toBeNull();
  });

  it("starts unlocked with a new identity and still auto-locks", () => {
    session.start(identity);
    expect(session.state().status).toBe("unlocked");
    expect(session.identity()).toBe(identity);
    advance(5 * MIN);
    expect(session.identity()).toBeNull();
  });

  it("auto-locks after the default 5 minutes without activity", async () => {
    expect(DEFAULT_AUTO_LOCK_MS).toBe(5 * MIN);
    await session.unlock(vault, "right");
    advance(4 * MIN);
    session.touch();
    advance(4 * MIN);
    expect(session.state().status).toBe("unlocked");
    advance(1 * MIN);
    expect(session.state().status).toBe("locked");
    expect(session.identity()).toBeNull();
  });

  it("locks on the next check or touch when timers were throttled", async () => {
    await session.unlock(vault, "right");
    clock += 6 * MIN; // laptop asleep: time passes, the timer never fires
    session.check();
    expect(session.state().status).toBe("locked");

    await session.unlock(vault, "right");
    clock += 6 * MIN;
    session.touch(); // activity after the window closed does not extend it
    expect(session.state().status).toBe("locked");
  });

  it("notifies subscribers only when the status changes", async () => {
    const seen: string[] = [];
    const off = session.subscribe(() => seen.push(session.state().status));
    await session.unlock(vault, "right");
    session.touch();
    session.lock();
    session.lock();
    off();
    expect(seen).toEqual(["unlocking", "unlocked", "locked"]);
  });
});

describe("passkey enrolment window (ADR-0034)", () => {
  const prf = {} as PasskeyPrf; // the fakes ignore it
  const make = () => {
    const addSlot = vi.fn(async (v: IdentityVault) => v);
    const s = createKeySession({
      now: () => clock,
      unlockVault: async (_v, p) => {
        if (p !== "right") throw new DecryptError();
        return identity;
      },
      unlockPasskey: async () => identity,
      addSlot,
    });
    return { s, addSlot };
  };

  it("opens only after a passphrase unlock, and is used up once", async () => {
    const { s, addSlot } = make();
    expect(s.canEnrolPasskey()).toBe(false);
    await s.unlock(vault, "right");
    expect(s.canEnrolPasskey()).toBe(true);
    await s.enrolPasskey(prf);
    expect(addSlot).toHaveBeenCalledWith(vault, "right", prf);
    expect(s.canEnrolPasskey()).toBe(false);
    await expect(s.enrolPasskey(prf)).rejects.toThrow();
  });

  it("closes on lock, on dismissal and after the window", async () => {
    const { s } = make();
    await s.unlock(vault, "right");
    s.lock();
    expect(s.canEnrolPasskey()).toBe(false);
    await s.unlock(vault, "right");
    s.dismissEnrol();
    expect(s.canEnrolPasskey()).toBe(false);
    await s.unlock(vault, "right");
    clock += ENROL_WINDOW_MS; // no timers: the session stays unlocked
    expect(s.canEnrolPasskey()).toBe(false);
    await expect(s.enrolPasskey(prf)).rejects.toThrow();
  });

  it("never opens after a passkey unlock or a failed passphrase", async () => {
    const { s } = make();
    expect(await s.unlockWithPasskey(vault, prf)).toBe(true);
    expect(s.canEnrolPasskey()).toBe(false);
    s.lock();
    expect(await s.unlock(vault, "wrong")).toBe(false);
    expect(s.canEnrolPasskey()).toBe(false);
  });

  it("keeps the passphrase out of the status snapshot", async () => {
    const { s } = make();
    await s.unlock(vault, "right");
    expect(JSON.stringify(s.state())).not.toContain("right");
  });
});

describe("installAutoLock", () => {
  it("restarts on activity, checks on return, and locks on pagehide", async () => {
    const document = Object.assign(new EventTarget(), {
      visibilityState: "visible",
    });
    const win = Object.assign(new EventTarget(), { document }) as never;
    const uninstall = installAutoLock(session, win);

    await session.unlock(vault, "right");
    advance(4 * MIN);
    (win as EventTarget).dispatchEvent(new Event("keydown"));
    advance(4 * MIN);
    expect(session.state().status).toBe("unlocked");

    clock += 6 * MIN;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(session.state().status).toBe("locked");

    await session.unlock(vault, "right");
    (win as EventTarget).dispatchEvent(new Event("pagehide"));
    expect(session.state().status).toBe("locked");

    uninstall();
    await session.unlock(vault, "right");
    (win as EventTarget).dispatchEvent(new Event("pagehide"));
    expect(session.state().status).toBe("unlocked");
  });
});

describe("with a real vault", () => {
  let real: Awaited<ReturnType<typeof createIdentity>>;
  beforeAll(async () => {
    real = await createIdentity("correct horse battery");
  }, 30_000);

  it("a wrong passphrase never yields a key", async () => {
    vi.useRealTimers();
    const s = createKeySession();
    expect(await s.unlock(real.vault, "wrong horse")).toBe(false);
    expect(s.identity()).toBeNull();
    expect(await s.unlock(real.vault, "correct horse battery")).toBe(true);
    expect(s.identity()?.privateKey.extractable).toBe(false);
    s.lock();
  }, 30_000);
});
