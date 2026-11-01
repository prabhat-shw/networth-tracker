// Shared ownership lens (#192, ADR-0071 §1): one choice across screens, reset on lock.
import { afterEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { PlainRecord } from "@/crypto/record-codec";
import { Accounts } from "@/features/accounts/accounts";
import { Goals } from "@/features/goals/goals";
import type { KeySession, LockStatus } from "@/features/lock/key-session";
import { SyncProvider } from "@/features/sync/sync-provider";
import type { HouseholdSync } from "@/sync/household-sync";
import { resetLensOnLock, useLensStore } from "./lens-store";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0a000000-0000-4000-8000-0000000000b2";
const GOAL = "9a000000-0000-4000-8000-000000000001";
const NO_PRICES = {};

let n = 0;
const record = (
  type: string,
  data: unknown,
  id?: string,
  by = ASHA,
): PlainRecord => ({
  id: id ?? `1a000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  version: 1,
  deleted: false,
  type,
  schemaVersion: 1,
  data,
  modifiedAt: "2026-10-30T00:00:00.000Z",
  modifiedBy: by,
});

const asset = (name: string, value: number, owners: unknown, extra = {}) =>
  record("asset", {
    owners,
    includeInNetWorth: true,
    tags: [],
    asOf: "2026-10-30",
    allocations: [],
    name,
    value,
    ...extra,
  });

// A joint 50/50 FD fully earmarked to the goal, and a savings account only Asha owns.
const RECORDS = [
  record("member", { memberId: ASHA, name: "Asha" }),
  // A profile counts only when its member wrote it (ADR-0054).
  record("member", { memberId: BALA, name: "Bala" }, undefined, BALA),
  record(
    "goal",
    {
      kind: "house",
      name: "House",
      targetAmount: 50_00_000_00,
      targetDate: "2032-01-01",
      inflationBps: 600,
      expectedReturnBps: 1000,
      priority: 1,
      owners: [{ memberId: ASHA, shareBps: 10_000 }],
    },
    GOAL,
  ),
  asset(
    "Joint FD",
    10_00_000_00,
    [
      { memberId: ASHA, shareBps: 5_000 },
      { memberId: BALA, shareBps: 5_000 },
    ],
    {
      kind: "fixedDeposit",
      issuer: "bank",
      payout: "cumulative",
      taxSaver: false,
      autoRenew: false,
      allocations: [{ goalId: GOAL, mode: "percent", bps: 10_000 }],
    },
  ),
  asset("Asha Savings", 2_00_000_00, [{ memberId: ASHA, shareBps: 10_000 }], {
    kind: "bankAccount",
    accountType: "savings",
  }),
];

const sync: HouseholdSync = {
  householdId: "h",
  userId: ASHA,
  records: () => RECORDS,
  write: async () => ({}) as never,
  status: () => ({ state: "synced", lastSyncedAt: null, pending: false }),
  universes: () => NO_PRICES,
  sync: async () => ({}) as never,
  subscribe: () => () => {},
  stop() {},
};

const mount = () =>
  render(
    <SyncProvider keys={{} as KeySession} userId={ASHA} start={() => sync}>
      <Goals />
      <Accounts />
    </SyncProvider>,
  );

afterEach(() => useLensStore.setState({ lens: "household" }));

describe("shared lens", () => {
  it("holds a choice made on one screen on the others", async () => {
    const screen = await mount();
    const bars = screen.getByRole("group", { name: "Whose net worth" });
    await expect
      .element(screen.getByText("₹10,00,000 of ₹50,00,000 (2032)"))
      .toBeVisible();
    await expect.element(screen.getByText("Asha Savings")).toBeVisible();

    await bars.first().getByRole("button", { name: "Bala" }).click();

    // Both bars now read Bala; Goals and Accounts show Bala's half only.
    for (const bar of bars.all())
      await expect
        .element(bar.getByRole("button", { name: "Bala" }))
        .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(screen.getByText("₹5,00,000 of ₹50,00,000 (2032)"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Asha Savings"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("Joint FD")).toBeVisible();
  });

  it("offers Me and falls back to Household for a lens nobody can pick", async () => {
    useLensStore.setState({ lens: "0a000000-0000-4000-8000-0000000000ff" });
    const screen = await mount();
    const bar = screen.getByRole("group", { name: "Whose net worth" }).first();
    await expect
      .element(bar.getByRole("button", { name: "Household" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect.element(bar.getByRole("button", { name: "Me" })).toBeVisible();
  });
});

describe("resetLensOnLock", () => {
  it("returns to Household when the session locks", () => {
    let status: LockStatus = "unlocked";
    let listener = () => {};
    const stop = resetLensOnLock({
      state: () => ({ status }),
      subscribe: (l) => {
        listener = l;
        return () => {};
      },
    });
    useLensStore.setState({ lens: BALA });
    listener();
    expect(useLensStore.getState().lens).toBe(BALA);
    status = "locked";
    listener();
    expect(useLensStore.getState().lens).toBe("household");
    stop();
  });
});
