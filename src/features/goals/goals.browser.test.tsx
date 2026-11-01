// Goals screen (#139): create, edit, delete; earmarked totals and the Unallocated card.
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { PlainRecord } from "@/crypto/record-codec";
import type { KeySession } from "@/features/lock/key-session";
import { SyncProvider } from "@/features/sync/sync-provider";
import type { HouseholdSync } from "@/sync/household-sync";
import { Goals } from "./goals";

const NO_PRICES = {};

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const GOAL = "9a000000-0000-4000-8000-000000000001";

let n = 0;
const record = (
  type: string,
  data: unknown,
  extra: Partial<PlainRecord> = {},
): PlainRecord => ({
  id: `1a000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  version: 1,
  deleted: false,
  type,
  schemaVersion: 1,
  data,
  modifiedAt: "2026-10-30T00:00:00.000Z",
  modifiedBy: ASHA,
  ...extra,
});

const mine = [{ memberId: ASHA, shareBps: 10_000 }];

const goal = (extra = {}) =>
  record(
    "goal",
    {
      kind: "education",
      name: "Ananya's Education",
      targetAmount: 50_00_000_00,
      targetDate: "2040-06-01",
      inflationBps: 1000,
      expectedReturnBps: 1000,
      priority: 1,
      owners: mine,
      ...extra,
    },
    { id: GOAL },
  );

// A 10L FD with 40% earmarked to the goal: 4L earmarked, 6L Unallocated.
const fd = record("asset", {
  owners: mine,
  includeInNetWorth: true,
  tags: [],
  asOf: "2026-10-30",
  allocations: [{ goalId: GOAL, mode: "percent", bps: 4000 }],
  kind: "fixedDeposit",
  name: "SBI FD",
  value: 10_00_000_00,
  issuer: "bank",
  payout: "cumulative",
  taxSaver: false,
  autoRenew: false,
});

function fakeSync(initial: PlainRecord[]) {
  let records = initial;
  let live = records;
  const listeners = new Set<() => void>();
  const sync: HouseholdSync = {
    householdId: "h",
    userId: ASHA,
    records: () => live,
    async write(id, type, data, deleted = false, schemaVersion = 1) {
      const r = record(type, data, { id, deleted, schemaVersion });
      records = [...records.filter((x) => x.id !== id), r];
      live = records.filter((x) => !x.deleted);
      for (const l of listeners) l();
      return r;
    },
    status: () => ({ state: "synced", lastSyncedAt: null, pending: false }),
    universes: () => NO_PRICES,
    sync: async () => ({}) as never,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    stop() {},
  };
  return { sync, all: () => records };
}

const mount = (sync: HouseholdSync) =>
  render(
    <SyncProvider keys={{} as KeySession} userId={ASHA} start={() => sync}>
      <Goals />
    </SyncProvider>,
  );

describe("Goals", () => {
  it("shows what accounts earmark to each goal and the Unallocated rest", async () => {
    const screen = await mount(fakeSync([goal(), fd]).sync);
    await expect
      .element(screen.getByText("₹4,00,000 of ₹50,00,000 (2040)"))
      .toBeVisible();
    const rest = screen.getByRole("listitem", { name: "Unallocated" });
    await expect.element(rest.getByText("₹6,00,000")).toBeVisible();
    await expect
      .element(screen.getByText("₹4,00,000 earmarked of ₹10,00,000 net worth"))
      .toBeVisible();
  });

  it("explains the empty state and still shows Unallocated when there is net worth", async () => {
    const screen = await mount(fakeSync([fd]).sync);
    await expect.element(screen.getByText(/No goals yet/)).toBeVisible();
    // The FD's claim points at a goal that doesn't exist: all of it is Unallocated.
    const rest = screen.getByRole("listitem", { name: "Unallocated" });
    await expect.element(rest.getByText("₹10,00,000")).toBeVisible();
  });

  it("hides Unallocated when there's nothing at all", async () => {
    const screen = await mount(fakeSync([]).sync);
    await expect.element(screen.getByText(/No goals yet/)).toBeVisible();
    await expect
      .element(screen.getByRole("listitem", { name: "Unallocated" }))
      .not.toBeInTheDocument();
  });

  it("creates a goal with the kind's inflation default", async () => {
    const { sync, all } = fakeSync([]);
    const screen = await mount(sync);
    await screen.getByRole("button", { name: "Add a goal" }).click();
    const dialog = screen.getByRole("dialog");
    await dialog.getByLabelText("Kind").selectOptions("education");
    await dialog.getByLabelText("Name").fill("College");
    await dialog.getByLabelText(/Target ₹/).fill("25,00,000");
    await dialog.getByLabelText("Target date").fill("2038-07-01");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect
      .element(screen.getByRole("button", { name: "College" }))
      .toBeVisible();
    const saved = all().find((r) => r.type === "goal");
    expect(saved?.data).toMatchObject({
      kind: "education",
      name: "College",
      targetAmount: 25_00_000_00,
      targetDate: "2038-07-01",
      inflationBps: 1000,
      priority: 3,
      owners: mine,
    });
  });

  it("can't save without a target", async () => {
    const screen = await mount(fakeSync([]).sync);
    await screen.getByRole("button", { name: "Add a goal" }).click();
    const dialog = screen.getByRole("dialog");
    await dialog.getByLabelText("Name").fill("Trip");
    await dialog.getByLabelText("Target date").fill("2028-01-01");
    await expect
      .element(dialog.getByRole("button", { name: "Save" }))
      .toBeDisabled();
  });

  it("edits a goal in place", async () => {
    const { sync, all } = fakeSync([goal(), fd]);
    const screen = await mount(sync);
    await screen.getByRole("button", { name: "Ananya's Education" }).click();
    const dialog = screen.getByRole("dialog");
    await dialog.getByLabelText("Name").fill("Ananya's College");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect
      .element(screen.getByRole("button", { name: "Ananya's College" }))
      .toBeVisible();
    expect(all().filter((r) => r.type === "goal")).toHaveLength(1);
    expect(all().find((r) => r.id === GOAL)?.data).toMatchObject({
      name: "Ananya's College",
      targetAmount: 50_00_000_00,
    });
  });

  it("deletes after confirming, and frees its earmark to Unallocated", async () => {
    const { sync, all } = fakeSync([goal(), fd]);
    const screen = await mount(sync);
    await screen.getByRole("button", { name: "Ananya's Education" }).click();
    const dialog = screen.getByRole("dialog");
    await dialog.getByRole("button", { name: "Delete" }).click();
    await dialog
      .getByRole("button", { name: "Yes, delete for everyone" })
      .click();
    await expect
      .element(screen.getByRole("button", { name: "Ananya's Education" }))
      .not.toBeInTheDocument();
    expect(all().find((r) => r.id === GOAL)?.deleted).toBe(true);
    const rest = screen.getByRole("listitem", { name: "Unallocated" });
    await expect.element(rest.getByText("₹10,00,000")).toBeVisible();
  });
});
