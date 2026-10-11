// Sign-in and routing gate in a real browser (UX.md §3.0 A, ADR-0025, #45).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { createHousehold } from "@/crypto/household";
import { generateIdentityKeyPair } from "@/crypto/keys";
import type { IdentityVault } from "@/crypto/vault";
import {
  createDeviceIdentity,
  type DeviceSlot,
  type DeviceSlotStore,
} from "@/crypto/vault-device";
import { toBase64url } from "@/crypto/wire";
import type { HouseholdApi } from "@/features/household/household-client";
import { createKeySession } from "@/features/lock/key-session";
import type { PrfApi } from "@/features/lock/passkey-prf";
import type { FirstRunApi } from "@/features/onboarding/first-run";
import type { StorageEnv } from "@/features/onboarding/install-hint";
import { AppGateView } from "./app-gate";

const persistedEnv: StorageEnv = {
  iosBrowserTab: () => false,
  persisted: async () => true,
};

import {
  betterAuthSignIn,
  PASSKEY_HINT_KEY,
  type SignInApi,
  type SignInResult,
} from "./auth-client";
import { SignIn } from "./sign-in";

const OK: SignInResult = { ok: true };
const fakeApi = (over: Partial<SignInApi> = {}): SignInApi => ({
  sendCode: vi.fn(async () => OK),
  verifyCode: vi.fn(async () => OK),
  sendLink: vi.fn(async () => OK),
  verifyLink: vi.fn(async () => OK),
  signInWithPasskey: vi.fn(async () => OK),
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

async function toCodeStep(api: SignInApi, onSignedIn = vi.fn()) {
  const screen = await render(<SignIn api={api} onSignedIn={onSignedIn} />);
  await screen.getByLabelText("Email").fill("asha@example.com");
  await screen.getByRole("button", { name: "Send code" }).click();
  return screen;
}

describe("sign in", () => {
  it("says the same thing whoever asks, then submits the code on the 6th digit", async () => {
    const api = fakeApi();
    const onSignedIn = vi.fn();
    const screen = await toCodeStep(api, onSignedIn);
    await expect
      .element(
        screen.getByText(
          "If this address can use NetWorth, a code is on its way.",
        ),
      )
      .toBeVisible();
    expect(api.sendCode).toHaveBeenCalledWith("asha@example.com");

    await screen.getByLabelText("6-digit code").fill("12345");
    expect(api.verifyCode).not.toHaveBeenCalled();
    await screen.getByLabelText("6-digit code").fill("123456");
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(api.verifyCode).toHaveBeenCalledWith("asha@example.com", "123456");
  });

  it("clears a wrong code and explains; an expired one asks for a new code", async () => {
    const verifyCode = vi
      .fn<SignInApi["verifyCode"]>()
      .mockResolvedValueOnce({ ok: false, error: { kind: "wrong-code" } })
      .mockResolvedValueOnce({ ok: false, error: { kind: "stale-code" } });
    const screen = await toCodeStep(fakeApi({ verifyCode }));
    const code = screen.getByLabelText("6-digit code");

    await code.fill("111111");
    await expect
      .element(screen.getByRole("alert"))
      .toMatchTextContent("That code isn't right");
    await expect.element(code).toHaveValue("");

    await code.fill("222222");
    await expect
      .element(screen.getByRole("alert"))
      .toMatchTextContent("That code has expired");
  });

  it("holds resend for 30 seconds", async () => {
    const screen = await toCodeStep(fakeApi());
    await expect
      .element(screen.getByRole("button", { name: /Resend code in \d+s/ }))
      .toBeDisabled();
  });

  it("shows a countdown and disables everything when rate-limited", async () => {
    const api = fakeApi({
      sendCode: async () => ({
        ok: false,
        error: { kind: "rate-limited", retryAfterS: 300 },
      }),
    });
    const screen = await render(<SignIn api={api} onSignedIn={vi.fn()} />);
    await screen.getByLabelText("Email").fill("asha@example.com");
    await screen.getByRole("button", { name: "Send code" }).click();
    await expect
      .element(screen.getByRole("alert"))
      .toMatchTextContent(/Try again in [45]:\d\d/);
    await expect
      .element(screen.getByRole("button", { name: "Send code" }))
      .toBeDisabled();
  });

  it("offers a passkey only when this browser registered one", async () => {
    const api = fakeApi();
    const onSignedIn = vi.fn();
    const without = await render(<SignIn api={api} onSignedIn={onSignedIn} />);
    await expect
      .element(without.getByRole("button", { name: "Sign in with passkey" }))
      .not.toBeInTheDocument();
    await cleanup();

    localStorage.setItem(PASSKEY_HINT_KEY, "1");
    const withKey = await render(<SignIn api={api} onSignedIn={onSignedIn} />);
    await withKey.getByRole("button", { name: "Sign in with passkey" }).click();
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
  });
});

describe("sign in with a link (ADR-0039)", () => {
  afterEach(() => history.replaceState(null, "", location.pathname));

  it("emails a link instead of a code, and can switch back to a code", async () => {
    const api = fakeApi();
    const screen = await render(<SignIn api={api} onSignedIn={vi.fn()} />);
    const link = screen.getByRole("button", {
      name: "Email me a link instead",
    });
    await link.click();
    expect(api.sendLink).not.toHaveBeenCalled(); // the address is required first

    await screen.getByLabelText("Email").fill("asha@example.com");
    await link.click();
    await expect
      .element(screen.getByText(/a sign-in link is on its way/))
      .toBeVisible();
    expect(api.sendLink).toHaveBeenCalledWith("asha@example.com");
    expect(api.sendCode).not.toHaveBeenCalled();

    await screen.getByRole("button", { name: "Send a code instead" }).click();
    await expect.element(screen.getByLabelText("6-digit code")).toBeVisible();
    expect(api.sendCode).toHaveBeenCalledWith("asha@example.com");
  });

  it("an opened link clears itself from the address bar and signs in only on Continue", async () => {
    history.replaceState(null, "", `${location.pathname}#link=tok%2Ben`);
    const api = fakeApi();
    const onSignedIn = vi.fn();
    const screen = await render(<SignIn api={api} onSignedIn={onSignedIn} />);
    const go = screen.getByRole("button", { name: "Continue" });
    await expect.element(go).toBeVisible();
    expect(location.hash).toBe("");
    expect(api.verifyLink).not.toHaveBeenCalled();

    await go.click();
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(api.verifyLink).toHaveBeenCalledWith("tok+en");
  });

  it("a spent link explains and falls back to the email form", async () => {
    history.replaceState(null, "", `${location.pathname}#link=old`);
    const api = fakeApi({
      verifyLink: vi.fn(async () => ({
        ok: false as const,
        error: { kind: "stale-link" as const },
      })),
    });
    const screen = await render(<SignIn api={api} onSignedIn={vi.fn()} />);
    await screen.getByRole("button", { name: "Continue" }).click();
    await expect
      .element(screen.getByRole("alert"))
      .toMatchTextContent("That link has expired or was already used");
    await expect.element(screen.getByLabelText("Email")).toBeVisible();
  });
});

describe("sign in over the real Better Auth client", () => {
  it("sends only the email and code, and stores neither (#45 acceptance)", async () => {
    const bodies: unknown[] = [];
    vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      if (url.endsWith("/sign-in/email-otp"))
        return Response.json({
          token: "t",
          user: { id: "u", email: "asha@example.com" },
        });
      return Response.json({ success: true });
    });
    const onSignedIn = vi.fn();
    const screen = await toCodeStep(betterAuthSignIn(), onSignedIn);
    await screen.getByLabelText("6-digit code").fill("482913");
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());

    expect(bodies).toEqual([
      { email: "asha@example.com", type: "sign-in" },
      { email: "asha@example.com", otp: "482913" },
    ]);
    const stored =
      JSON.stringify({ ...localStorage }) +
      JSON.stringify({ ...sessionStorage });
    expect(stored).not.toContain("482913");
    expect(stored).not.toContain("asha@example.com");
    expect(await indexedDB.databases()).toEqual([]);
  });

  it("reads the retry delay from a 429", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json(
        { message: "Too many requests" },
        { status: 429, headers: { "x-retry-after": "120" } },
      ),
    );
    const res = await betterAuthSignIn().sendCode("asha@example.com");
    expect(res).toEqual({
      ok: false,
      error: { kind: "rate-limited", retryAfterS: 120 },
    });
  });

  it("asks for a link with the email only, and counts a link as spent unless a session comes back", async () => {
    const calls: { url: string; body?: unknown }[] = [];
    let verifyAnswer = Response.json({ token: "t", session: { id: "s" } });
    vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.includes("/magic-link/verify")) return verifyAnswer;
      return Response.json({ status: true });
    });
    const api = betterAuthSignIn();
    expect(await api.sendLink("asha@example.com")).toEqual({ ok: true });
    expect(calls[0].body).toEqual({ email: "asha@example.com" });

    expect(await api.verifyLink("tok")).toEqual({ ok: true });
    expect(new URL(calls[1].url).searchParams.get("token")).toBe("tok");
    expect(new URL(calls[1].url).searchParams.has("callbackURL")).toBe(false);

    // A bad token redirects to the app page: HTML, not a session.
    verifyAnswer = new Response("<html></html>", {
      headers: { "content-type": "text/html" },
    });
    expect(await api.verifyLink("bad")).toEqual({
      ok: false,
      error: { kind: "stale-link" },
    });
  });
});

describe("routing gate", () => {
  const vault = { passkeys: [] } as unknown as IdentityVault;
  const prf = (available: boolean): PrfApi => ({
    available: async () => available,
    unlock: async () => null,
    enrol: async () => null,
  });
  const noVault = async () => null;
  const hasVault = async () => vault;
  const session = (email: string | null, pending = false) => ({
    pending,
    userId: email ? "0a000000-0000-4000-8000-0000000000a1" : null,
    email,
    refetch: vi.fn(),
  });
  /** No device slot unless one is given; never touches IndexedDB. */
  const devices =
    (slot: DeviceSlot | null = null) =>
    (): DeviceSlotStore => ({
      load: async () => slot,
      save: async (s) => {
        slot = s;
      },
      clear: async () => {
        slot = null;
      },
    });
  const firstRunApi: FirstRunApi = {
    putVault: async () => {},
    myHouseholds: async () => ({ households: [], invited: false }),
    createHousehold: async () => {},
  };

  it("signed out → sign-in; no vault → first run; vault → unlock; unlocked → household → app", async () => {
    // A real identity and a self-wrapped household, so the household gate (#63) opens.
    const identity = await generateIdentityKeyPair();
    const { household, selfWrap } = await createHousehold(identity);
    const householdApi: HouseholdApi = {
      myHouseholds: async () => ({
        households: [{ id: household.householdId }],
        invites: [],
      }),
      myWrap: async () => toBase64url(selfWrap),
      decline: async () => {},
    };
    const keys = createKeySession({ unlockVault: async () => identity });
    const app = <p>the app</p>;

    const out = await render(
      <AppGateView session={session(null)} keys={keys}>
        {app}
      </AppGateView>,
    );
    await expect.element(out.getByLabelText("Email")).toBeVisible();
    await cleanup();

    // First run asks nothing: straight to the app with a new household.
    const firstKeys = createKeySession();
    const first = await render(
      <AppGateView
        session={session("asha@example.com")}
        loadVault={noVault}
        devices={devices()}
        firstRunApi={firstRunApi}
        keys={firstKeys}
        storageEnv={persistedEnv}
      >
        {app}
      </AppGateView>,
    );
    await expect
      .element(first.getByText("the app"), { timeout: 15_000 })
      .toBeVisible();
    expect(firstKeys.householdKey()).not.toBeNull();
    await cleanup();

    const gate = await render(
      <AppGateView
        session={session("asha@example.com")}
        loadVault={hasVault}
        devices={devices()}
        keys={keys}
        householdApi={householdApi}
        prf={prf(false)}
      >
        {app}
      </AppGateView>,
    );
    await expect.element(gate.getByText("asha@example.com")).toBeVisible();
    await expect.element(gate.getByLabelText("Passphrase")).toBeVisible();
    await gate.getByLabelText("Passphrase").fill("anything at all");
    await gate.getByRole("button", { name: "Unlock" }).click();
    await expect.element(gate.getByText("the app")).toBeVisible();
    expect(keys.householdKey()?.householdId).toBe(household.householdId);

    keys.lock();
    await expect.element(gate.getByLabelText("Passphrase")).toBeVisible();
  });

  it("offers fast unlock once after a passphrase unlock; Not now goes to the app", async () => {
    const identity = await generateIdentityKeyPair();
    const { household, selfWrap } = await createHousehold(identity);
    const householdApi: HouseholdApi = {
      myHouseholds: async () => ({
        households: [{ id: household.householdId }],
        invites: [],
      }),
      myWrap: async () => toBase64url(selfWrap),
      decline: async () => {},
    };
    const keys = createKeySession({ unlockVault: async () => identity });
    const gate = await render(
      <AppGateView
        session={session("asha@example.com")}
        loadVault={hasVault}
        devices={devices()}
        keys={keys}
        householdApi={householdApi}
        prf={prf(true)}
      >
        <p>the app</p>
      </AppGateView>,
    );
    await gate.getByLabelText("Passphrase").fill("anything at all");
    await gate.getByRole("button", { name: "Unlock" }).click();
    await expect
      .element(gate.getByText("Unlock faster next time"))
      .toBeVisible();
    await gate.getByRole("button", { name: "Not now" }).click();
    await expect.element(gate.getByText("the app")).toBeVisible();
    expect(keys.canEnrolPasskey()).toBe(false);

    // Declined on this device: the next unlock goes straight to the app.
    keys.lock();
    await gate.getByLabelText("Passphrase").fill("anything at all");
    await gate.getByRole("button", { name: "Unlock" }).click();
    await expect.element(gate.getByText("the app")).toBeVisible();
  });

  it("keeps the code step when the session is re-checked on returning to the tab (#82)", async () => {
    const api = fakeApi();
    const view = (s: ReturnType<typeof session>) => (
      <AppGateView session={s} signInApi={api}>
        <p>the app</p>
      </AppGateView>
    );
    const screen = await render(view(session(null, true)));
    await expect.element(screen.getByText("Loading…")).toBeVisible();
    await screen.rerender(view(session(null)));
    await screen.getByLabelText("Email").fill("asha@example.com");
    await screen.getByRole("button", { name: "Send code" }).click();
    await expect.element(screen.getByLabelText("6-digit code")).toBeVisible();

    // Better Auth's focus refetch: pending again while signed out, then settled.
    await screen.rerender(view(session(null, true)));
    await expect.element(screen.getByLabelText("6-digit code")).toBeVisible();
    await screen.rerender(view(session(null)));
    await expect.element(screen.getByLabelText("6-digit code")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "If this address can use NetWorth, a code is on its way.",
        ),
      )
      .toBeVisible();
  });

  it("offers a retry when the vault can't be loaded", async () => {
    const load = vi
      .fn<() => Promise<IdentityVault | null>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(null);
    const screen = await render(
      <AppGateView
        session={session("asha@example.com")}
        loadVault={load}
        devices={devices()}
        firstRunApi={{ ...firstRunApi, putVault: () => new Promise(() => {}) }}
      >
        <p>the app</p>
      </AppGateView>,
    );
    await screen.getByRole("button", { name: "Try again" }).click();
    await expect
      .element(screen.getByText("Setting up on this device…"))
      .toBeVisible();
  });

  it("returning with this device's slot opens the app with no unlock, and again after auto-lock", async () => {
    const { vault, device, identity } = await createDeviceIdentity();
    const { household, selfWrap } = await createHousehold(identity);
    const householdApi: HouseholdApi = {
      myHouseholds: async () => ({
        households: [{ id: household.householdId }],
        invites: [],
      }),
      myWrap: async () => toBase64url(selfWrap),
      decline: async () => {},
    };
    const keys = createKeySession();
    const screen = await render(
      <AppGateView
        session={session("asha@example.com")}
        loadVault={async () => vault}
        devices={devices(device)}
        keys={keys}
        householdApi={householdApi}
        storageEnv={persistedEnv}
      >
        <p>the app</p>
      </AppGateView>,
    );
    await expect.element(screen.getByText("the app")).toBeVisible();
    await expect
      .element(screen.getByLabelText("Passphrase"))
      .not.toBeInTheDocument();
    keys.lock();
    await expect.element(screen.getByText("the app")).toBeVisible();
    expect(keys.state().status).toBe("unlocked");
  });

  it("another identity's slot is ignored; a slotless vault elsewhere explains where the key is", async () => {
    const mine = await createDeviceIdentity();
    const other = await createDeviceIdentity();
    const screen = await render(
      <AppGateView
        session={session("asha@example.com")}
        loadVault={async () => mine.vault}
        devices={devices(other.device)}
        keys={createKeySession()}
      >
        <p>the app</p>
      </AppGateView>,
    );
    await expect
      .element(screen.getByText(/Your key is only on the device/))
      .toBeVisible();
    await expect.element(screen.getByText("the app")).not.toBeInTheDocument();
  });
});
