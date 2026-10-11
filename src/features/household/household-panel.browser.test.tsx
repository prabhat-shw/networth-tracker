// Inviter's Household panel and code check (#64, ADR-0031). Real WebCrypto keys and
// wraps; the server is a fake PanelApi.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  createHousehold,
  type HouseholdKey,
  keyFingerprint,
  unwrapHouseholdKey,
} from "@/crypto/household";
import { exportPublicKey, generateIdentityKeyPair } from "@/crypto/keys";
import type { UnlockedIdentity } from "@/crypto/vault";
import { createDeviceIdentity } from "@/crypto/vault-device";
import { fromBase64url, toBase64url } from "@/crypto/wire";
import { createKeySession } from "@/features/lock/key-session";
import type { PrfApi } from "@/features/lock/passkey-prf";
import {
  RecoveryContext,
  type RecoverySource,
} from "@/features/lock/recovery-chooser";
import { HouseholdPanel } from "./household-panel";
import {
  httpPanelApi,
  type OpenInvite,
  type PanelApi,
  RecoveryRequiredError,
} from "./panel-client";

let asha: UnlockedIdentity; // the inviter
let bala: UnlockedIdentity; // the invitee
let hdk: HouseholdKey;
let ashaPub: string;
let balaCode: string;
let ashaCode: string;

beforeEach(async () => {
  asha = await generateIdentityKeyPair();
  bala = await generateIdentityKeyPair();
  hdk = (await createHousehold(asha)).household;
  const a = await exportPublicKey(asha.publicKey);
  const b = await exportPublicKey(bala.publicKey);
  ashaPub = toBase64url(a);
  ashaCode = await keyFingerprint(a);
  balaCode = await keyFingerprint(b);
});

const BALA_ID = "00000000-0000-4000-8000-00000000ba1a";

async function readyInvite(): Promise<OpenInvite> {
  return {
    emailHash: "hash-bala",
    expiresAt: "2026-10-12T00:00:00.000Z",
    invitee: {
      userId: BALA_ID,
      email: "bala@example.com",
      publicKey: toBase64url(await exportPublicKey(bala.publicKey)),
    },
  };
}

function server(invites: OpenInvite[]) {
  const api: PanelApi = {
    members: vi.fn(async () => [
      { userId: "asha", publicKey: ashaPub, joinedAt: "2026-09-01" },
    ]),
    invites: vi.fn(async () => invites),
    invite: vi.fn(async () => {}),
    add: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
  };
  return api;
}

async function panel(api: PanelApi) {
  const keys = createKeySession();
  keys.start(asha);
  keys.setHouseholdKey(hdk);
  return render(<HouseholdPanel keys={keys} api={api} />);
}

describe("HouseholdPanel", () => {
  it("lists members and invites, and sends an invite", async () => {
    const api = server([
      { emailHash: "h1", expiresAt: "2026-10-12", invitee: null },
      await readyInvite(),
    ]);
    const screen = await panel(api);
    await expect.element(screen.getByText("You")).toBeVisible();
    await expect.element(screen.getByText("🔑 Has access")).toBeVisible();
    await expect.element(screen.getByText("⏳ Invite pending")).toBeVisible();
    await expect.element(screen.getByText("🔑 Ready to add")).toBeVisible();

    await screen.getByLabelText("Invite member").fill("  chitra@example.com ");
    await screen.getByRole("button", { name: "Invite", exact: true }).click();
    await vi.waitFor(() =>
      expect(api.invite).toHaveBeenCalledWith(
        hdk.householdId,
        "chitra@example.com",
      ),
    );
  });

  it("shows both codes, and adds only after It matches, wrapped to that key", async () => {
    const api = server([await readyInvite()]);
    const screen = await panel(api);
    await screen.getByRole("button", { name: /bala@example.com/ }).click();
    await expect.element(screen.getByText(balaCode)).toBeVisible();
    await expect.element(screen.getByText(ashaCode)).toBeVisible();
    expect(api.add).not.toHaveBeenCalled();

    await screen
      .getByRole("button", { name: "It matches — add bala@example.com" })
      .click();
    await vi.waitFor(() => expect(api.add).toHaveBeenCalledOnce());
    const [householdId, userId, wrap] = vi.mocked(api.add).mock.calls[0];
    expect([householdId, userId]).toEqual([hdk.householdId, BALA_ID]);
    const opened = await unwrapHouseholdKey(
      bala,
      hdk.householdId,
      fromBase64url(wrap),
    );
    expect(opened.senderPublicKey).toEqual(fromBase64url(ashaPub));
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it("It doesn't match cancels the invite and wraps nothing", async () => {
    const api = server([await readyInvite()]);
    const screen = await panel(api);
    await screen.getByRole("button", { name: /bala@example.com/ }).click();
    await screen.getByRole("button", { name: "It doesn't match" }).click();
    await expect
      .element(screen.getByText(/Someone may be intercepting/))
      .toBeVisible();
    expect(api.cancel).toHaveBeenCalledWith(hdk.householdId, "hash-bala");
    expect(api.add).not.toHaveBeenCalled();
  });

  it("Not now closes the check and adds or cancels nothing", async () => {
    const api = server([await readyInvite()]);
    const screen = await panel(api);
    await screen.getByRole("button", { name: /bala@example.com/ }).click();
    await screen.getByRole("button", { name: "Not now" }).click();
    await expect.element(screen.getByText(balaCode)).not.toBeInTheDocument();
    expect(api.add).not.toHaveBeenCalled();
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it("a pending invite has nothing to check or wrap to", async () => {
    const api = server([
      { emailHash: "h1", expiresAt: "2026-10-12", invitee: null },
    ]);
    const screen = await panel(api);
    await expect.element(screen.getByText("⏳ Invite pending")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /Invited/ }))
      .not.toBeInTheDocument();
    expect(api.add).not.toHaveBeenCalled();
  });
});

describe("protect before the first invite (ADR-0040)", () => {
  /** The server refuses once (no recovery method yet), then accepts. */
  function refusingOnce() {
    const api = server([]);
    api.invite = vi
      .fn<PanelApi["invite"]>()
      .mockRejectedValueOnce(new RecoveryRequiredError())
      .mockResolvedValue(undefined);
    return api;
  }

  it("opens the chooser on the refusal, then sends the same invite once protected", async () => {
    const api = refusingOnce();
    const { vault, device } = await createDeviceIdentity();
    const source: RecoverySource = {
      email: "asha@example.com",
      vault,
      device,
      saveVault: vi.fn(async () => {}),
      dropDeviceSlot: vi.fn(async () => {}),
    };
    const keys = createKeySession();
    keys.start(asha);
    keys.setHouseholdKey(hdk);
    const noPrf: PrfApi = {
      available: async () => false,
      unlock: async () => null,
      enrol: async () => null,
    };
    const screen = await render(
      <RecoveryContext value={source}>
        <HouseholdPanel keys={keys} api={api} prf={noPrf} />
      </RecoveryContext>,
    );
    await screen.getByLabelText("Invite member").fill("bala@example.com");
    await screen.getByRole("button", { name: "Invite", exact: true }).click();
    await expect
      .element(screen.getByText("Protect your account first"))
      .toBeVisible();

    await screen.getByRole("button", { name: "Choose a passphrase" }).click();
    await screen.getByLabelText("Passphrase").fill("correct horse battery");
    await screen.getByRole("button", { name: "Save passphrase" }).click();
    await vi.waitFor(() => expect(api.invite).toHaveBeenCalledTimes(2), {
      timeout: 15_000,
    });
    expect(api.invite).toHaveBeenLastCalledWith(
      hdk.householdId,
      "bala@example.com",
    );
    expect(source.saveVault).toHaveBeenCalledOnce();
    await expect.element(screen.getByText("Household")).toBeVisible();
  });

  it("without a device slot to build from, explains instead", async () => {
    const api = refusingOnce();
    const screen = await panel(api);
    await screen.getByLabelText("Invite member").fill("bala@example.com");
    await screen.getByRole("button", { name: "Invite", exact: true }).click();
    await expect
      .element(screen.getByRole("alert"))
      .toMatchTextContent("Add a way back in");
  });
});

describe("httpPanelApi.invite", () => {
  it("turns the server's recovery-required 409 into RecoveryRequiredError, nothing else", async () => {
    const fetchSpy = vi.spyOn(window, "fetch");
    fetchSpy.mockResolvedValueOnce(
      Response.json({ error: "recovery-required" }, { status: 409 }),
    );
    await expect(httpPanelApi.invite("hh", "b@example.com")).rejects.toThrow(
      RecoveryRequiredError,
    );
    fetchSpy.mockResolvedValueOnce(
      Response.json({ error: "something else" }, { status: 409 }),
    );
    const other = await httpPanelApi
      .invite("hh", "b@example.com")
      .catch((e) => e);
    expect(other).toBeInstanceOf(Error);
    expect(other).not.toBeInstanceOf(RecoveryRequiredError);
    fetchSpy.mockRestore();
  });
});
