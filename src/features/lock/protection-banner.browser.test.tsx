// The protection banner (ADR-0042) and the BS-flag memory it reads, in a real browser.
import { afterEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { backupState, isSynced, markSynced } from "./passkey-prf";
import { RISK_COPY } from "./protection";
import { BANNER_DISMISSED_KEY, ProtectionBanner } from "./protection-banner";

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("ProtectionBanner", () => {
  it("shows one line per risk", async () => {
    const screen = await render(
      <ProtectionBanner risks={["single-method", "app-lock-off"]} />,
    );
    await expect
      .element(screen.getByText(RISK_COPY["single-method"]))
      .toBeVisible();
    await expect
      .element(screen.getByText(RISK_COPY["app-lock-off"]))
      .toBeVisible();
  });

  it("renders nothing without risks", async () => {
    const screen = await render(<ProtectionBanner risks={[]} />);
    expect(screen.container.textContent).toBe("");
  });

  it("dismisses for this session only, and comes back for a new gap", async () => {
    const screen = await render(<ProtectionBanner risks={["app-lock-off"]} />);
    await screen.getByRole("button", { name: "Not now" }).click();
    await expect
      .element(screen.getByText(RISK_COPY["app-lock-off"]))
      .not.toBeInTheDocument();
    expect(sessionStorage.getItem(BANNER_DISMISSED_KEY)).toBe("app-lock-off");
    expect(localStorage.getItem(BANNER_DISMISSED_KEY)).toBeNull();

    const again = await render(<ProtectionBanner risks={["app-lock-off"]} />);
    expect(again.container.textContent).toBe("");
    const wider = await render(
      <ProtectionBanner risks={["single-method", "app-lock-off"]} />,
    );
    await expect
      .element(wider.getByText(RISK_COPY["single-method"]))
      .toBeVisible();
  });
});

describe("synced passkeys", () => {
  const authData = (flags: number) => {
    const d = new Uint8Array(37);
    d[32] = flags;
    return d;
  };

  it("reads the backup-state bit of the flags byte", () => {
    expect(backupState(authData(0x1d))).toBe(true); // UP|UV|BE|BS
    expect(backupState(authData(0x0d))).toBe(false); // eligible, not backed up
    expect(backupState(new Uint8Array(32))).toBe(false);
  });

  it("remembers the last flag per credential", () => {
    const id = new Uint8Array([1, 2, 3, 4]);
    expect(isSynced(id)).toBe(false);
    markSynced(id, true);
    expect(isSynced(id)).toBe(true);
    markSynced(id, false);
    expect(isSynced(id)).toBe(false);
  });
});
