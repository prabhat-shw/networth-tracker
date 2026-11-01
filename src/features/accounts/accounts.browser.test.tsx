// Accounts list (#137): sections, ownership badges, search, error rows, tap to edit.
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { PlainRecord } from "@/crypto/record-codec";
import type { KeySession } from "@/features/lock/key-session";
import { SyncProvider } from "@/features/sync/sync-provider";
import type { HouseholdSync } from "@/sync/household-sync";
import { Accounts } from "./accounts";

const NO_PRICES = {};

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
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

const common = (owners: { memberId: string; shareBps: number }[]) => ({
  owners,
  includeInNetWorth: true,
  tags: [],
  asOf: "2026-10-30",
  allocations: [],
});
const mine = common([{ memberId: ASHA, shareBps: 10_000 }]);

const HOUSEHOLD = [
  record("member", { memberId: BALA, name: "Bala" }, { modifiedBy: BALA }),
  record("asset", {
    ...mine,
    kind: "fixedDeposit",
    name: "SBI FD",
    institution: "SBI",
    value: 2_00_000_00,
    issuer: "bank",
    payout: "cumulative",
    taxSaver: false,
    autoRenew: false,
    allocations: [{ goalId: GOAL, mode: "percent", bps: 4000 }],
  }),
  record("asset", {
    ...common([
      { memberId: BALA, shareBps: 4000 },
      { memberId: ASHA, shareBps: 6000 },
    ]),
    kind: "bankAccount",
    name: "HDFC Joint Savings",
    value: 8_42_300_00,
    accountType: "savings",
  }),
  record("asset", {
    ...common([{ memberId: BALA, shareBps: 10_000 }]),
    kind: "ppf",
    name: "Bala PPF",
    value: 5_00_000_00,
  }),
  record("liability", {
    ...mine,
    kind: "creditCard",
    name: "Amex",
    value: 12_000_00,
  }),
];

function fakeSync(initial: PlainRecord[]) {
  let records = initial;
  // Like the real handle: tombstones are excluded, and the array is stable between writes.
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
      <Accounts />
    </SyncProvider>,
  );

describe("Accounts", () => {
  it("groups records by section and keeps empty sections visible", async () => {
    const screen = await mount(fakeSync(HOUSEHOLD).sync);
    const deposits = screen.getByRole("table", { name: "Deposits" });
    await expect.element(deposits.getByText("SBI FD")).toBeVisible();
    await expect.element(deposits.getByText("40% tagged")).toBeVisible();
    await expect
      .element(
        screen.getByRole("table", { name: "Loans & Debts" }).getByText("Amex"),
      )
      .toBeVisible();
    await expect
      .element(screen.getByText("Foreign", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText("Nothing here yet").first())
      .toBeVisible();
  });

  it("badges records that aren't all mine", async () => {
    const screen = await mount(fakeSync(HOUSEHOLD).sync);
    await expect.element(screen.getByText("◐ 60/40 · Bala")).toBeVisible();
    await expect.element(screen.getByText("Bala's")).toBeVisible();
  });

  it("filters across sections and hides the empty ones while searching", async () => {
    const screen = await mount(fakeSync(HOUSEHOLD).sync);
    await screen
      .getByRole("searchbox", { name: "Search accounts" })
      .fill("hdfc");
    await expect.element(screen.getByText("HDFC Joint Savings")).toBeVisible();
    await expect.element(screen.getByText("SBI FD")).not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Deposits", { exact: true }))
      .not.toBeInTheDocument();
    await screen
      .getByRole("searchbox", { name: "Search accounts" })
      .fill("platypus");
    await expect.element(screen.getByText("No accounts match.")).toBeVisible();
  });

  it("shows an unreadable record as its own row and still lists the rest", async () => {
    const bad = record("asset", { kind: "fixedDeposit", name: 42 });
    const newer = record("asset", { anything: true }, { schemaVersion: 99 });
    const { sync, all } = fakeSync([...HOUSEHOLD, bad, newer]);
    const screen = await mount(sync);
    await expect.element(screen.getByText("SBI FD")).toBeVisible();
    await expect
      .element(screen.getByText("Couldn't load this record"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Needs a newer app version"))
      .toBeVisible();
    // A strict locator: only the invalid record offers Remove; the newer one is kept.
    await screen.getByRole("button", { name: "Remove" }).click();
    await screen.getByRole("button", { name: "Yes, remove it" }).click();
    await expect
      .element(screen.getByText("Couldn't load this record"))
      .not.toBeInTheDocument();
    expect(all().find((r) => r.id === bad.id)?.deleted).toBe(true);
  });

  it("opens a record's edit form from its name", async () => {
    const screen = await mount(fakeSync(HOUSEHOLD).sync);
    await screen.getByRole("button", { name: "SBI FD" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "Edit Fixed deposit" }))
      .toBeVisible();
    await expect.element(screen.getByLabelText("Name")).toHaveValue("SBI FD");
  });

  it("shows the first-run CTA for an empty household", async () => {
    const screen = await mount(fakeSync([]).sync);
    await expect
      .element(screen.getByRole("button", { name: "Add your first account" }))
      .toBeVisible();
  });
});
