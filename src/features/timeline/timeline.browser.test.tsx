// Net worth timeline (#193, UX.md §3.3): ranges, compare cap, table, breakdown, empty state.
import { afterEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { PlainRecord } from "@/crypto/record-codec";
import { istDate } from "@/domain/records/snapshot";
import { useLensStore } from "@/features/lens/lens-store";
import type { KeySession } from "@/features/lock/key-session";
import { SyncProvider } from "@/features/sync/sync-provider";
import type { HouseholdSync } from "@/sync/household-sync";
import { Timeline } from "./timeline";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0a000000-0000-4000-8000-0000000000b2";
const CHITRA = "0a000000-0000-4000-8000-0000000000c3";
const NO_PRICES = {};
const LAKH = 1_00_000_00;

let n = 0;
const record = (type: string, data: unknown, by = ASHA): PlainRecord => ({
  id: `1a000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  version: 1,
  deleted: false,
  type,
  schemaVersion: 1,
  data,
  modifiedAt: "2026-10-30T00:00:00.000Z",
  modifiedBy: by,
});

const daysAgo = (d: number) => istDate(new Date(Date.now() - d * 86_400_000));
const t = (net: number) => ({ assets: net, liabilities: 0, net });
const snapshot = (date: string, asha: number, bala: number) =>
  record("snapshot", {
    date,
    household: t(asha + bala),
    members: { [ASHA]: t(asha), [BALA]: t(bala) },
    formerMembers: t(0),
    buckets: { cashBank: asha + bala },
    stale: false,
  });

const savings = (owner: string, value: number) =>
  record("asset", {
    owners: [{ memberId: owner, shareBps: 10_000 }],
    includeInNetWorth: true,
    tags: [],
    asOf: "2026-10-30",
    allocations: [],
    kind: "bankAccount",
    accountType: "savings",
    name: `Savings ${owner.slice(-2)}`,
    value,
  });

const MEMBERS = [
  record("member", { memberId: ASHA, name: "Asha" }),
  record("member", { memberId: BALA, name: "Bala" }, BALA),
  record("member", { memberId: CHITRA, name: "Chitra" }, CHITRA),
];

const fake = (records: PlainRecord[]): HouseholdSync => ({
  householdId: "h",
  userId: ASHA,
  records: () => records,
  write: async () => ({}) as never,
  status: () => ({ state: "synced", lastSyncedAt: null, pending: false }),
  universes: () => NO_PRICES,
  sync: async () => ({}) as never,
  subscribe: () => () => {},
  stop() {},
});

const mount = (records: PlainRecord[]) =>
  render(
    <SyncProvider
      keys={{} as KeySession}
      userId={ASHA}
      start={() => fake(records)}
    >
      <Timeline />
    </SyncProvider>,
  );

// Live today: Asha 6L, Bala 3L. History: 400 days ago, 20 days ago.
const HISTORY = [
  ...MEMBERS,
  snapshot(daysAgo(400), 1 * LAKH, 1 * LAKH),
  snapshot(daysAgo(20), 5 * LAKH, 2 * LAKH),
  savings(ASHA, 6 * LAKH),
  savings(BALA, 3 * LAKH),
];

afterEach(() => useLensStore.setState({ lens: "household" }));

describe("Timeline", () => {
  it("draws the series and lists it as a table, today from live values", async () => {
    const screen = await mount(HISTORY);
    await expect
      .element(screen.getByRole("figure", { name: "Net worth chart" }))
      .toBeVisible();
    await screen.getByText("View as table").click();
    const table = screen.getByRole("table", { name: "Net worth by date" });
    // 1Y by default: the 400-day-old point is out, so 20 days ago and today.
    await expect.element(table.getByText(daysAgo(400))).not.toBeInTheDocument();
    await expect.element(table.getByText("₹7,00,000")).toBeVisible();
    await expect.element(table.getByText("₹9,00,000")).toBeVisible();
    await expect.element(table.getByText("▲ +₹2,00,000")).toBeVisible();

    await screen.getByRole("button", { name: "All" }).click();
    await expect.element(table.getByText(daysAgo(400))).toBeVisible();
  });

  it("caps compared lines at three and labels table columns", async () => {
    const screen = await mount(HISTORY);
    const compare = screen.getByRole("group", { name: "Compare members" });
    await compare.getByRole("checkbox", { name: "Me" }).click();
    await compare.getByRole("checkbox", { name: "Bala" }).click();
    await expect
      .element(compare.getByRole("checkbox", { name: "Chitra" }))
      .toBeDisabled();
    await screen.getByText("View as table").click();
    const table = screen.getByRole("table", { name: "Net worth by date" });
    for (const name of ["Household", "Me", "Bala"])
      await expect
        .element(table.getByText(name, { exact: true }))
        .toBeVisible();
  });

  it("follows the lens and breaks the latest point down by member", async () => {
    useLensStore.setState({ lens: BALA });
    const screen = await mount(HISTORY);
    await screen.getByText("View as table").click();
    const table = screen.getByRole("table", { name: "Net worth by date" });
    await expect
      .element(table.getByText("Bala", { exact: true }))
      .toBeVisible();
    await expect.element(table.getByText("▲ +₹1,00,000")).toBeVisible();

    await screen.getByRole("button", { name: "By member" }).click();
    const breakdown = screen.getByRole("region", { name: "Breakdown" });
    await expect.element(breakdown.getByText("Me")).toBeVisible();
    await expect.element(breakdown.getByText("₹6,00,000")).toBeVisible();
  });

  it("waits for two check-ins but still shows the composition", async () => {
    const screen = await mount([...MEMBERS, savings(ASHA, 6 * LAKH)]);
    await expect
      .element(screen.getByText(/starts once you've had two check-ins/))
      .toBeVisible();
    const breakdown = screen.getByRole("region", { name: "Breakdown" });
    await expect.element(breakdown.getByText("Cash & Bank")).toBeVisible();
  });
});
