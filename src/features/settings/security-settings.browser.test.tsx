// Settings → Security (#103, ADR-0043) in a real browser, on real vaults: app lock off
// re-asks and keeps a slot that opens the key, app lock on drops it, methods are added and
// removed without ever leaving no way back in (or, with app lock on, no way to unlock).
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { randomBytes } from "@/crypto/kdf";
import { type IdentityVault, unlockWithPassphrase } from "@/crypto/vault";
import {
  addPasskeyFromDevice,
  addPassphraseFromDevice,
  addRecoveryKitFromDevice,
  createDeviceIdentity,
  type DeviceSlot,
  openDeviceSlot,
} from "@/crypto/vault-device";
import { newPrfSalt } from "@/crypto/vault-passkey";
import { PASSKEY_BOUNDS } from "@/crypto/wire";
import type { KeySession } from "@/features/lock/key-session";
import type { PrfApi } from "@/features/lock/passkey-prf";
import {
  SecurityContext,
  SecuritySettings,
  type SecuritySource,
} from "./security-settings";

const PASS = "correct horse battery";
const PRF = {
  credentialId: randomBytes(32),
  prfSalt: newPrfSalt(),
  prfOutput: randomBytes(PASSKEY_BOUNDS.prfOutputBytes),
};
const fakePrf: PrfApi = {
  available: async () => true,
  unlock: async () => PRF,
  enrol: async () => PRF,
};

afterEach(() => {
  localStorage.clear();
});

type Calls = {
  saved: IdentityVault[];
  kept: DeviceSlot[];
  dropped: number;
};

/** Holds vault and device slot in state, as the gate does. */
async function settings(vault: IdentityVault, device: DeviceSlot | null) {
  const calls: Calls = { saved: [], kept: [], dropped: 0 };
  const keys = { lock: vi.fn() } as unknown as KeySession;
  function Harness() {
    const [v, setV] = useState(vault);
    const [d, setD] = useState(device);
    const source: SecuritySource = {
      email: "asha@example.com",
      vault: v,
      device: d,
      async saveVault(next) {
        calls.saved.push(next);
        setV(next);
      },
      async keepDeviceSlot(slot) {
        calls.kept.push(slot);
        setD(slot);
      },
      async dropDeviceSlot() {
        calls.dropped++;
        setD(null);
      },
    };
    return (
      <SecurityContext value={source}>
        <SecuritySettings
          keys={keys}
          prf={fakePrf}
          addPasskey={async () => true}
        />
      </SecurityContext>
    );
  }
  const screen = await render(<Harness />);
  return { screen, calls, keys };
}

async function made(options: {
  pass?: boolean;
  kit?: boolean;
  passkey?: boolean;
}) {
  const m = await createDeviceIdentity();
  let vault = m.vault;
  if (options.pass)
    vault = await addPassphraseFromDevice(vault, m.device, PASS);
  if (options.kit)
    vault = (await addRecoveryKitFromDevice(vault, m.device)).vault;
  if (options.passkey) vault = await addPasskeyFromDevice(vault, m.device, PRF);
  return { vault, device: m.device };
}

describe("Settings → Security", () => {
  it("app lock off asks for the passphrase, then keeps a slot that opens the key", async () => {
    const { vault } = await made({ pass: true, kit: true });
    const { screen, calls } = await settings(vault, null);
    const toggle = screen.getByRole("switch", { name: /App lock/ });
    await expect.element(toggle).toBeChecked();
    await toggle.click();
    const dialog = screen.getByRole("dialog", { name: "Confirm it's you" });
    await dialog.getByLabelText("Passphrase").fill("wrong one");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect.element(dialog.getByRole("alert")).toBeVisible();
    expect(calls.kept).toHaveLength(0);

    await dialog.getByLabelText("Passphrase").fill(PASS);
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect.element(toggle).not.toBeChecked();
    expect(calls.kept).toHaveLength(1);
    expect(calls.kept[0].key.extractable).toBe(false);
    await openDeviceSlot(vault, calls.kept[0]);
  });

  it("app lock off with a passkey, then on again drops the slot", async () => {
    const { vault } = await made({ kit: true, passkey: true });
    const { screen, calls } = await settings(vault, null);
    const toggle = screen.getByRole("switch", { name: /App lock/ });
    await toggle.click();
    await screen.getByRole("button", { name: "Use passkey" }).click();
    await expect.element(toggle).not.toBeChecked();
    await toggle.click();
    await expect.element(toggle).toBeChecked();
    expect(calls.dropped).toBe(1);
  });

  it("can't turn app lock on with only a kit; adding a passphrase from the device slot allows it", async () => {
    const { vault, device } = await made({ kit: true });
    const { screen, calls } = await settings(vault, device);
    await expect
      .element(screen.getByText("Your only way back in"))
      .toBeVisible();
    const toggle = screen.getByRole("switch", { name: /App lock/ });
    await expect.element(toggle).toBeDisabled();

    await screen.getByRole("button", { name: "Add a way back in" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "Add a way back in" }))
      .toBeVisible();
    await screen.getByRole("button", { name: "Choose a passphrase" }).click();
    await screen.getByLabelText("Passphrase").fill(PASS);
    await screen.getByRole("button", { name: "Save passphrase" }).click();
    await expect.element(toggle, { timeout: 15_000 }).toBeEnabled();
    await unlockWithPassphrase(calls.saved[0], PASS);
    expect(calls.kept).toHaveLength(0);
  });

  it("adding with app lock on asks first, and doesn't keep the borrowed slot", async () => {
    const { vault } = await made({ pass: true });
    const { screen, calls } = await settings(vault, null);
    await screen.getByRole("button", { name: "Add a way back in" }).click();
    const dialog = screen.getByRole("dialog", { name: "Confirm it's you" });
    await dialog.getByLabelText("Passphrase").fill(PASS);
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await screen.getByRole("button", { name: "Use Face ID / passkey" }).click();
    await vi.waitFor(() => expect(calls.saved).toHaveLength(1));
    expect(calls.saved[0].passkeys).toHaveLength(1);
    expect(calls.kept).toHaveLength(0);
    expect(calls.dropped).toBe(0);
  });

  it("removes a method after confirming; with app lock on, the last unlock method stays", async () => {
    const { vault } = await made({ pass: true, kit: true, passkey: true });
    const { screen, calls } = await settings(vault, null);
    await screen.getByRole("button", { name: "Remove Passphrase" }).click();
    await screen.getByRole("button", { name: "Yes, remove" }).click();
    await vi.waitFor(() => expect(calls.saved).toHaveLength(1));
    expect(calls.saved[0].byPassphrase).toBeNull();
    await expect
      .element(screen.getByText("App lock needs a passkey or passphrase"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Remove Recovery kit" }))
      .toBeVisible();
  });

  it("Lock now locks the session", async () => {
    const { vault } = await made({ pass: true });
    const { screen, keys } = await settings(vault, null);
    await screen.getByRole("button", { name: "Lock now" }).click();
    expect(keys.lock).toHaveBeenCalledOnce();
  });
});
