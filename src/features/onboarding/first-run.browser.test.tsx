// Silent first run in a real browser (UX.md §3.0 B, ADR-0037, #97). Real WebCrypto and the
// real HTTP client with `fetch` intercepted, so the assertions about what leaves the device
// are about the actual requests.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { unwrapHouseholdKey } from "@/crypto/household";
import {
  type DeviceSlot,
  type DeviceSlotStore,
  openDeviceSlot,
} from "@/crypto/vault-device";
import { decodeVault, fromBase64url } from "@/crypto/wire";
import { createKeySession } from "@/features/lock/key-session";
import { FirstRun, type FirstRunApi, httpFirstRunApi } from "./first-run";
import { INSTALL_HINT_KEY, InstallHint, type StorageEnv } from "./install-hint";

type Sent = { method: string; url: string; body: string | null };

/** Intercepts `fetch` with a tiny fake server; records every request into `log`. */
function fakeServer(
  log: string[],
  { invited = false, failVaultOnce = false } = {},
) {
  const sent: Sent[] = [];
  let failVault = failVaultOnce;
  vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    sent.push({ method, url, body: init?.body ? String(init.body) : null });
    log.push(`${method} ${new URL(url, location.href).pathname}`);
    if (url.endsWith("/api/identity/vault")) {
      if (failVault) {
        failVault = false;
        return new Response(null, { status: 503 });
      }
      return new Response(null, { status: 204 });
    }
    if (url.endsWith("/api/households") && method === "GET")
      return Response.json({ households: [], invited });
    if (url.endsWith("/api/households"))
      return Response.json({}, { status: 201 });
    return new Response(null, { status: 404 });
  });
  return sent;
}

function memoryStore(log: string[]) {
  let slot: DeviceSlot | null = null;
  const store: DeviceSlotStore = {
    load: async () => slot,
    save: vi.fn(async (s: DeviceSlot) => {
      log.push("save device slot");
      slot = s;
    }),
    clear: async () => {
      slot = null;
    },
  };
  return { store, slot: () => slot };
}

async function start(api: FirstRunApi = httpFirstRunApi, log: string[] = []) {
  const keys = createKeySession();
  const onDone = vi.fn();
  const device = memoryStore(log);
  const screen = await render(
    <FirstRun api={api} keys={keys} store={device.store} onDone={onDone} />,
  );
  return { screen, keys, onDone, device };
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("silent first run", () => {
  it("asks nothing: keeps the key in the device slot, uploads the vault, creates the household", async () => {
    const log: string[] = [];
    const sent = fakeServer(log);
    const { keys, onDone, device } = await start(httpFirstRunApi, log);
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce(), {
      timeout: 15_000,
    });

    // The slot is saved before anything is uploaded.
    expect(log).toEqual([
      "save device slot",
      "PUT /api/identity/vault",
      "GET /api/households",
      "POST /api/households",
    ]);
    const vaultBody = JSON.parse(sent[0].body ?? "");
    expect(Object.keys(vaultBody).sort()).toEqual(["publicKey", "v"]);
    const vault = decodeVault(vaultBody);
    const slot = device.slot();
    if (!slot) throw new Error("no device slot");
    expect(slot.key.extractable).toBe(false);
    const opened = await openDeviceSlot(vault, slot);

    const { id, wrappedHdk } = JSON.parse(sent[2].body ?? "");
    const { household: hdk } = await unwrapHouseholdKey(
      opened,
      id,
      fromBase64url(wrappedHdk),
    );
    expect(keys.state().status).toBe("unlocked");
    expect(keys.householdKey()?.householdId).toBe(hdk.householdId);
    expect(onDone.mock.calls[0][0]).toMatchObject({ waitingToJoin: false });
  });

  it("an invitee waits to join instead of creating a household", async () => {
    const log: string[] = [];
    fakeServer(log, { invited: true });
    const { keys, onDone } = await start(httpFirstRunApi, log);
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce(), {
      timeout: 15_000,
    });
    expect(log).not.toContain("POST /api/households");
    expect(keys.householdKey()).toBeNull();
    expect(onDone.mock.calls[0][0]).toMatchObject({ waitingToJoin: true });
  });

  it("a failed upload offers a retry that keeps the same identity", async () => {
    const log: string[] = [];
    const sent = fakeServer(log, { failVaultOnce: true });
    const { screen, onDone, device } = await start(httpFirstRunApi, log);
    await screen.getByRole("button", { name: "Try again" }).click();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce(), {
      timeout: 15_000,
    });
    const puts = sent.filter((s) => s.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts[0].body).toBe(puts[1].body);
    expect(device.store.save).toHaveBeenCalledOnce();
  });
});

describe("storage hint", () => {
  const env = (ios: boolean, persisted: boolean): StorageEnv => ({
    iosBrowserTab: () => ios,
    persisted: async () => persisted,
  });

  it("iOS Safari: Add to Home Screen, dismissed for good", async () => {
    const screen = await render(<InstallHint env={env(true, false)} />);
    await expect
      .element(screen.getByText(/Add NetWorth to your Home Screen/))
      .toBeVisible();
    await screen.getByRole("button", { name: "Got it" }).click();
    expect(localStorage.getItem(INSTALL_HINT_KEY)).toBe("dismissed");
    await expect
      .element(screen.getByRole("complementary"))
      .not.toBeInTheDocument();
  });

  it("refused persistent storage gets a risk line; granted gets nothing", async () => {
    const refused = await render(<InstallHint env={env(false, false)} />);
    await expect
      .element(refused.getByText(/may clear NetWorth's data/))
      .toBeVisible();
    refused.unmount();

    const granted = await render(<InstallHint env={env(false, true)} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(granted.container.textContent).toBe("");
  });
});
