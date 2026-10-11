// "Protect your account first" (ADR-0040) in a real browser: each choice adds its slot from
// a real device slot, and the saved vault really opens with what the user chose.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { randomBytes } from "@/crypto/kdf";
import {
  type IdentityVault,
  restoreWithRecoveryCode,
  unlockWithPassphrase,
} from "@/crypto/vault";
import { createDeviceIdentity } from "@/crypto/vault-device";
import { newPrfSalt, unlockWithPasskey } from "@/crypto/vault-passkey";
import { decodeVault, encodeVault } from "@/crypto/wire";
import { PASSKEY_HINT_KEY } from "@/features/auth/auth-client";
import type { PrfApi } from "./passkey-prf";
import { RecoveryChooser, type RecoverySource } from "./recovery-chooser";

const PRF = {
  credentialId: randomBytes(32),
  prfSalt: newPrfSalt(),
  prfOutput: randomBytes(32),
};
const fakePrf = (available = true, withPrf = true): PrfApi => ({
  available: async () => available,
  unlock: async () => null,
  enrol: async () => (withPrf ? PRF : null),
});

let source: RecoverySource;
let saved: IdentityVault[];
const reload = (v: IdentityVault) =>
  decodeVault(JSON.parse(JSON.stringify(encodeVault(v))));

beforeEach(async () => {
  const { vault, device } = await createDeviceIdentity();
  saved = [];
  source = {
    email: "asha@example.com",
    vault,
    device,
    saveVault: vi.fn(async (next) => {
      saved.push(reload(next));
    }),
    dropDeviceSlot: vi.fn(async () => {}),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

async function chooser(prf = fakePrf(), addPasskey = vi.fn(async () => true)) {
  const onProtected = vi.fn();
  const onCancel = vi.fn();
  const screen = await render(
    <RecoveryChooser
      source={source}
      prf={prf}
      addPasskey={addPasskey}
      onProtected={onProtected}
      onCancel={onCancel}
    />,
  );
  return { screen, onProtected, onCancel, addPasskey };
}

describe("recovery chooser", () => {
  it("a passphrase: saved vault unlocks with it; the device slot stays", async () => {
    const { screen, onProtected } = await chooser();
    await screen.getByRole("button", { name: "Choose a passphrase" }).click();
    await screen.getByLabelText("Passphrase").fill("short");
    await screen.getByRole("button", { name: "Save passphrase" }).click();
    expect(source.saveVault).not.toHaveBeenCalled();

    await screen.getByLabelText("Passphrase").fill("correct horse battery");
    await screen.getByRole("button", { name: "Save passphrase" }).click();
    await vi.waitFor(() => expect(onProtected).toHaveBeenCalledOnce(), {
      timeout: 15_000,
    });
    await unlockWithPassphrase(saved[0], "correct horse battery");
    expect(source.dropDeviceSlot).not.toHaveBeenCalled();
  });

  it("a recovery kit: saved only after the two words are confirmed, and it restores", async () => {
    const { screen, onProtected } = await chooser();
    await screen.getByRole("button", { name: "Save a recovery kit" }).click();
    const list = screen.getByRole("list", { name: "Recovery words" });
    await expect.element(list).toBeVisible();
    const words = Array.from(
      list.element().querySelectorAll("li"),
      (li) => li.lastElementChild?.textContent ?? "",
    );
    expect(words).toHaveLength(24);
    expect(source.saveVault).not.toHaveBeenCalled();

    for (const field of await screen.getByLabelText(/^Word \d+$/).all()) {
      const label = field.element().closest("label")?.textContent ?? "";
      const n = Number(/Word (\d+)/.exec(label)?.[1]);
      await field.fill(words[n - 1]);
    }
    await screen.getByRole("button", { name: "Done" }).click();
    await vi.waitFor(() => expect(onProtected).toHaveBeenCalledOnce());
    await restoreWithRecoveryCode(saved[0], words.join(" "), "new passphrase");
  });

  it("Face ID / passkey: adds a PRF slot and turns app lock on", async () => {
    const { screen, onProtected, addPasskey } = await chooser();
    await screen.getByRole("button", { name: "Use Face ID / passkey" }).click();
    await vi.waitFor(() => expect(onProtected).toHaveBeenCalledOnce());
    expect(addPasskey).toHaveBeenCalledOnce();
    await unlockWithPasskey(saved[0], PRF);
    expect(source.dropDeviceSlot).toHaveBeenCalledOnce();
    expect(localStorage.getItem(PASSKEY_HINT_KEY)).toBe("1");
  });

  it("a passkey without PRF saves nothing and points to the other choices", async () => {
    const { screen, onProtected } = await chooser(fakePrf(true, false));
    await screen.getByRole("button", { name: "Use Face ID / passkey" }).click();
    await expect
      .element(screen.getByRole("alert"))
      .toMatchTextContent("can't unlock your data");
    expect(source.saveVault).not.toHaveBeenCalled();
    expect(source.dropDeviceSlot).not.toHaveBeenCalled();
    expect(onProtected).not.toHaveBeenCalled();
  });

  it("hides Face ID without PRF support; Not now cancels", async () => {
    const { screen, onCancel } = await chooser(fakePrf(false));
    await expect
      .element(screen.getByRole("button", { name: "Choose a passphrase" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Use Face ID / passkey" }))
      .not.toBeInTheDocument();
    await screen.getByRole("button", { name: "Not now" }).click();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("a failed save says so and does not report success", async () => {
    source.saveVault = vi.fn(async () => {
      throw new Error("offline");
    });
    const { screen, onProtected } = await chooser();
    await screen.getByRole("button", { name: "Choose a passphrase" }).click();
    await screen.getByLabelText("Passphrase").fill("correct horse battery");
    await screen.getByRole("button", { name: "Save passphrase" }).click();
    await expect
      .element(screen.getByRole("alert"), { timeout: 15_000 })
      .toMatchTextContent("Couldn't save");
    expect(onProtected).not.toHaveBeenCalled();
  });
});
