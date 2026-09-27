// Sign-in and routing gate in a real browser (UX.md §3.0 A, ADR-0025, #45).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import type { IdentityVault } from "@/crypto/vault";
import { createKeySession } from "@/features/lock/key-session";
import { AppGateView } from "./app-gate";
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
});

describe("routing gate", () => {
  const vault = {} as IdentityVault;
  const noVault = async () => null;
  const hasVault = async () => vault;
  const session = (email: string | null, pending = false) => ({
    pending,
    email,
    refetch: vi.fn(),
  });

  it("signed out → sign-in; no vault → first run; vault → unlock; unlocked → app", async () => {
    const keys = createKeySession({ unlockVault: async () => ({}) as never });
    const app = <p>the app</p>;

    const out = await render(
      <AppGateView session={session(null)} keys={keys}>
        {app}
      </AppGateView>,
    );
    await expect.element(out.getByLabelText("Email")).toBeVisible();
    await cleanup();

    const first = await render(
      <AppGateView
        session={session("asha@example.com")}
        loadVault={noVault}
        keys={keys}
      >
        {app}
      </AppGateView>,
    );
    await expect.element(first.getByText(/First-time setup/)).toBeVisible();
    await cleanup();

    const gate = await render(
      <AppGateView
        session={session("asha@example.com")}
        loadVault={hasVault}
        keys={keys}
      >
        {app}
      </AppGateView>,
    );
    await expect.element(gate.getByText("asha@example.com")).toBeVisible();
    await expect.element(gate.getByLabelText("Passphrase")).toBeVisible();
    await gate.getByLabelText("Passphrase").fill("anything at all");
    await gate.getByRole("button", { name: "Unlock" }).click();
    await expect.element(gate.getByText("the app")).toBeVisible();

    keys.lock();
    await expect.element(gate.getByLabelText("Passphrase")).toBeVisible();
  });

  it("offers a retry when the vault can't be loaded", async () => {
    const load = vi
      .fn<() => Promise<IdentityVault | null>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(null);
    const screen = await render(
      <AppGateView session={session("asha@example.com")} loadVault={load}>
        <p>the app</p>
      </AppGateView>,
    );
    await screen.getByRole("button", { name: "Try again" }).click();
    await expect.element(screen.getByText(/First-time setup/)).toBeVisible();
  });
});
