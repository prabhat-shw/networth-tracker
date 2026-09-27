// Household key after unlock, waiting to join, and the inviter code check (#63, ADR-0030).
// Real WebCrypto keys and wraps; the server is a fake HouseholdApi.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  createHousehold,
  type HouseholdKey,
  keyFingerprint,
  wrapHouseholdKey,
} from "@/crypto/household";
import { exportPublicKey, generateIdentityKeyPair } from "@/crypto/keys";
import type { UnlockedIdentity } from "@/crypto/vault";
import { toBase64url } from "@/crypto/wire";
import { createKeySession } from "@/features/lock/key-session";
import {
  type HouseholdApi,
  type MyHouseholds,
  resolveHousehold,
  trustStore,
} from "./household-client";
import { HouseholdGate } from "./household-gate";

let asha: UnlockedIdentity; // the inviter
let bala: UnlockedIdentity; // the invitee
let hdk: HouseholdKey;
let ashaCode: string;

beforeEach(async () => {
  localStorage.clear();
  asha = await generateIdentityKeyPair();
  bala = await generateIdentityKeyPair();
  hdk = (await createHousehold(asha)).household;
  ashaCode = await keyFingerprint(await exportPublicKey(asha.publicKey));
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

/** A fake server whose state the test can move: invited → added. */
function server(start: MyHouseholds, wrap?: Uint8Array) {
  let state = start;
  let wrapB64 = wrap ? toBase64url(wrap) : "";
  const api: HouseholdApi = {
    myHouseholds: vi.fn(async () => state),
    myWrap: async () => wrapB64,
    decline: vi.fn(async () => {}),
  };
  return {
    api,
    add(nextWrap: Uint8Array) {
      state = { households: [{ id: hdk.householdId }], invites: [] };
      wrapB64 = toBase64url(nextWrap);
    },
  };
}

const invited = (): MyHouseholds => ({
  households: [],
  invites: [{ householdId: hdk.householdId, invitedBy: "Asha" }],
});

async function wrapFor(recipient: UnlockedIdentity, sender = asha) {
  return wrapHouseholdKey(
    sender,
    hdk,
    await exportPublicKey(recipient.publicKey),
  );
}

function gate(api: HouseholdApi, identity = bala) {
  const keys = createKeySession();
  keys.start(identity);
  const view = render(
    <HouseholdGate keys={keys} api={api}>
      <p>the app</p>
    </HouseholdGate>,
  );
  return { keys, view };
}

describe("resolveHousehold", () => {
  it("installs a self-wrap straight away, and asks about anyone else's", async () => {
    const own = server(
      { households: [{ id: hdk.householdId }], invites: [] },
      await wrapFor(asha, asha),
    );
    expect((await resolveHousehold(asha, own.api)).kind).toBe("ready");

    const added = server(
      { households: [{ id: hdk.householdId }], invites: [] },
      await wrapFor(bala),
    );
    const r = await resolveHousehold(bala, added.api);
    expect(r).toMatchObject({ kind: "confirm", senderFingerprint: ashaCode });

    trustStore.set(hdk.householdId, ashaCode);
    expect((await resolveHousehold(bala, added.api)).kind).toBe("ready");
  });

  it("waits when only invited, and reports nothing when neither", async () => {
    expect(await resolveHousehold(bala, server(invited()).api)).toEqual({
      kind: "waiting",
      householdId: hdk.householdId,
      invitedBy: "Asha",
    });
    expect(
      await resolveHousehold(bala, server({ households: [], invites: [] }).api),
    ).toEqual({ kind: "none" });
  });

  it("refuses a wrap addressed to someone else", async () => {
    const wrong = server(
      { households: [{ id: hdk.householdId }], invites: [] },
      await wrapFor(asha),
    );
    await expect(resolveHousehold(bala, wrong.api)).rejects.toThrow();
  });
});

describe("household gate (#63 acceptance)", () => {
  it("waits with the invitee's code, then installs the key only after Yes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fake = server(invited());
    const { keys, view } = gate(fake.api);
    const screen = await view;
    const balaCode = await keyFingerprint(
      await exportPublicKey(bala.publicKey),
    );

    await expect.element(screen.getByText("Waiting to join")).toBeVisible();
    await expect
      .element(screen.getByText(/Asha needs to add you/))
      .toBeVisible();
    await expect.element(screen.getByText(balaCode)).toBeVisible();

    fake.add(await wrapFor(bala));
    await vi.advanceTimersByTimeAsync(5_000);
    await expect.element(screen.getByText("Check who added you")).toBeVisible();
    await expect.element(screen.getByText(ashaCode)).toBeVisible();
    expect(keys.householdKey()).toBeNull(); // not before the member says yes

    await screen.getByRole("button", { name: "Yes — open household" }).click();
    await expect.element(screen.getByText("the app")).toBeVisible();
    expect(keys.householdKey()?.householdId).toBe(hdk.householdId);
    expect(trustStore.get(hdk.householdId)).toBe(ashaCode);
  });

  it("never installs the key when the sender's code doesn't match", async () => {
    const fake = server(
      { households: [{ id: hdk.householdId }], invites: [] },
      await wrapFor(bala),
    );
    const { keys, view } = gate(fake.api);
    const screen = await view;
    await screen.getByRole("button", { name: "No" }).click();
    await expect
      .element(screen.getByRole("alert"))
      .toMatchTextContent(/^Stop\./);
    await expect.element(screen.getByText("the app")).not.toBeInTheDocument();
    expect(keys.householdKey()).toBeNull();
    expect(trustStore.get(hdk.householdId)).toBeNull();
  });

  it("loads the key again after lock and unlock, without asking twice", async () => {
    trustStore.set(hdk.householdId, ashaCode);
    const fake = server(
      { households: [{ id: hdk.householdId }], invites: [] },
      await wrapFor(bala),
    );
    const { keys, view } = gate(fake.api);
    const screen = await view;
    await expect.element(screen.getByText("the app")).toBeVisible();
    expect(keys.householdKey()?.householdId).toBe(hdk.householdId);

    keys.lock();
    expect(keys.householdKey()).toBeNull();
    keys.start(bala);
    const again = await render(
      <HouseholdGate keys={keys} api={fake.api}>
        <p>the app again</p>
      </HouseholdGate>,
    );
    await expect.element(again.getByText("the app again")).toBeVisible();
    expect(keys.householdKey()?.householdId).toBe(hdk.householdId);
  });

  it("shows an error, and no app, when the wrap can't be opened", async () => {
    const fake = server(
      { households: [{ id: hdk.householdId }], invites: [] },
      await wrapFor(asha), // meant for someone else
    );
    const { keys, view } = gate(fake.api);
    const screen = await view;
    await expect
      .element(screen.getByText(/Couldn't open your household/))
      .toBeVisible();
    expect(keys.householdKey()).toBeNull();
  });
});
