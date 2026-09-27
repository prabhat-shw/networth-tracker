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
import { fromBase64url, toBase64url } from "@/crypto/wire";
import { createKeySession } from "@/features/lock/key-session";
import { HouseholdPanel } from "./household-panel";
import type { OpenInvite, PanelApi } from "./panel-client";

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
