// Passkey fast unlock in a real browser (UX.md §3.1, ADR-0034, #75). Real vault crypto; the
// authenticator is a fake `PrfApi`, since headless Chrome has no passkeys.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { randomBytes } from "@/crypto/kdf";
import { createIdentity, type IdentityVault } from "@/crypto/vault";
import { newPrfSalt, type PasskeyPrf } from "@/crypto/vault-passkey";
import { EnrolOffer } from "./enrol-offer";
import { createKeySession } from "./key-session";
import { FAST_UNLOCK_KEY, type PrfApi } from "./passkey-prf";
import { UnlockScreen } from "./unlock-screen";

const PASS = "correct horse battery staple";
const newPrf = (): PasskeyPrf => ({
  credentialId: randomBytes(32),
  prfSalt: newPrfSalt(),
  prfOutput: randomBytes(32),
});

let plain: IdentityVault;
let withSlot: IdentityVault;
let phone: PasskeyPrf;

beforeAll(async () => {
  const made = await createIdentity(PASS);
  plain = made.vault;
  phone = newPrf();
  withSlot = await made.enrolPasskey(made.vault, phone);
}, 30_000);

afterEach(() => localStorage.clear());

const fakePrf = (over: Partial<PrfApi> = {}): PrfApi => ({
  available: async () => true,
  unlock: vi.fn(async () => phone),
  enrol: vi.fn(async () => newPrf()),
  ...over,
});

async function show(vault: IdentityVault, prf: PrfApi) {
  const session = createKeySession();
  const screen = await render(
    <UnlockScreen
      email="asha@example.com"
      vault={vault}
      session={session}
      prf={prf}
    />,
  );
  return { screen, session };
}

describe("passkey unlock", () => {
  it("is primary when the vault has a slot, and unlocks with it", async () => {
    const { screen, session } = await show(withSlot, fakePrf());
    const button = screen.getByRole("button", {
      name: "Unlock with Face ID / passkey",
    });
    await expect.element(button).toBeVisible();
    expect(screen.getByLabelText("Passphrase").query()).toBeNull();
    await button.click();
    await vi.waitFor(() => expect(session.state().status).toBe("unlocked"));
    // A passkey unlock never offers to enrol again.
    expect(session.canEnrolPasskey()).toBe(false);
  });

  it("expands the passphrase in place on request", async () => {
    const { screen } = await show(withSlot, fakePrf());
    await screen
      .getByRole("button", { name: "Use passphrase instead" })
      .click();
    await expect.element(screen.getByLabelText("Passphrase")).toBeVisible();
  });

  it("falls back to the passphrase after two failed attempts", async () => {
    const unlock = vi
      .fn<PrfApi["unlock"]>()
      .mockRejectedValueOnce(new Error("NotAllowedError"))
      .mockResolvedValue({ ...phone, prfOutput: randomBytes(32) });
    const { screen, session } = await show(withSlot, fakePrf({ unlock }));
    const button = screen.getByRole("button", {
      name: "Unlock with Face ID / passkey",
    });
    await button.click();
    await expect.element(screen.getByRole("alert")).toBeVisible();
    await button.click();
    await expect.element(screen.getByLabelText("Passphrase")).toBeVisible();
    await expect.element(screen.getByText(/passkey didn.t work/)).toBeVisible();
    expect(unlock).toHaveBeenCalledTimes(2);
    expect(session.state().status).not.toBe("unlocked");
  });

  it("goes quietly to the passphrase when the passkey gives no PRF output", async () => {
    const { screen } = await show(
      withSlot,
      fakePrf({ unlock: async () => null }),
    );
    await screen
      .getByRole("button", { name: "Unlock with Face ID / passkey" })
      .click();
    await expect.element(screen.getByLabelText("Passphrase")).toBeVisible();
    expect(screen.getByRole("alert").query()).toBeNull();
  });

  it("shows only the passphrase without PRF support or without a slot", async () => {
    for (const [vault, prf] of [
      [withSlot, fakePrf({ available: async () => false })],
      [plain, fakePrf()],
    ] as const) {
      const { screen } = await show(vault, prf);
      await expect.element(screen.getByLabelText("Passphrase")).toBeVisible();
      expect(
        screen.getByRole("button", { name: /passkey/ }).query(),
      ).toBeNull();
      await cleanup();
    }
  });
});

describe("fast-unlock offer after a passphrase unlock", () => {
  it("adds a slot, uploads only the new vault, and is not offered again", async () => {
    const session = createKeySession();
    await session.unlock(plain, PASS);
    const putVault = vi.fn(async (_v: IdentityVault) => {});
    const onEnrolled = vi.fn();
    const onClose = vi.fn();
    const prf = fakePrf();
    const screen = await render(
      <EnrolOffer
        vault={plain}
        keys={session}
        prf={prf}
        putVault={putVault}
        onEnrolled={onEnrolled}
        onClose={onClose}
      />,
    );
    await screen.getByRole("button", { name: "Use a passkey" }).click();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce(), 15_000);
    const next = putVault.mock.calls[0][0];
    expect(next.passkeys).toHaveLength(1);
    expect(onEnrolled).toHaveBeenCalledWith(next);
    expect(localStorage.getItem(FAST_UNLOCK_KEY)).toBe("enrolled");
    expect(session.canEnrolPasskey()).toBe(false);

    const again = vi.fn();
    await render(
      <EnrolOffer
        vault={next}
        keys={session}
        prf={prf}
        onEnrolled={vi.fn()}
        onClose={again}
      />,
    );
    await vi.waitFor(() => expect(again).toHaveBeenCalledOnce(), 5_000);
  });

  it("closes quietly when the passkey gives no PRF output", async () => {
    const session = createKeySession();
    await session.unlock(plain, PASS);
    const putVault = vi.fn(async () => {});
    const onClose = vi.fn();
    const screen = await render(
      <EnrolOffer
        vault={plain}
        keys={session}
        prf={fakePrf({ enrol: async () => null })}
        putVault={putVault}
        onEnrolled={vi.fn()}
        onClose={onClose}
      />,
    );
    await screen.getByRole("button", { name: "Use a passkey" }).click();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce(), 15_000);
    expect(putVault).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").query()).toBeNull();
  });
});
