// Valuation on read (#169): market values, "as of", stale tone and "manual value" captions.
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { PlainRecord } from "@/crypto/record-codec";
import type { Universe, Universes } from "@/domain/prices/universe";
import { Accounts } from "@/features/accounts/accounts";
import { Goals } from "@/features/goals/goals";
import type { KeySession } from "@/features/lock/key-session";
import { SyncProvider } from "@/features/sync/sync-provider";
import type { HouseholdSync } from "@/sync/household-sync";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";

let n = 0;
const asset = (data: object): PlainRecord => ({
  id: `1a000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  version: 1,
  deleted: false,
  type: "asset",
  schemaVersion: 1,
  data: {
    owners: [{ memberId: ASHA, shareBps: 10_000 }],
    includeInNetWorth: true,
    tags: [],
    asOf: "2026-10-30",
    allocations: [],
    value: 1_000_00,
    ...data,
  },
  modifiedAt: "2026-10-30T00:00:00.000Z",
  modifiedBy: ASHA,
});

const RECORDS = [
  asset({
    kind: "mutualFund",
    name: "Parag Parikh Flexi Cap",
    plan: "direct",
    quantity: "2950.123",
    instrument: { source: "amfi", code: "122639" },
  }),
  asset({
    kind: "stock",
    name: "Infosys",
    quantity: "3",
    instrument: { source: "nse", code: "INFY" },
  }),
  asset({
    kind: "mutualFund",
    name: "Old closed fund",
    plan: "regular",
    quantity: "10",
    instrument: { source: "amfi", code: "999999" },
  }),
  asset({ kind: "cash", name: "Wallet cash", value: 5_000_00 }),
];

const file = (
  kind: Universe["kind"],
  date: string,
  hoursAgo: number,
  prices: Record<string, string>,
): Universe => ({
  kind,
  date,
  fetchedAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
  source: "fixture",
  currency: "INR",
  prices,
});

const fakeSync = (universes: Universes): HouseholdSync => ({
  householdId: "h",
  userId: ASHA,
  records: () => RECORDS,
  write: async () => ({}) as never,
  status: () => ({ state: "synced", lastSyncedAt: null, pending: false }),
  universes: () => universes,
  sync: async () => ({}) as never,
  subscribe: () => () => {},
  stop() {},
});

const mount = (universes: Universes, ui: React.ReactNode) =>
  render(
    <SyncProvider
      keys={{} as KeySession}
      userId={ASHA}
      start={() => fakeSync(universes)}
    >
      {ui}
    </SyncProvider>,
  );

const FRESH = file("amfi", "2026-10-31", 2, { "122639": "29.7532" });
const STALE = file("nse", "2026-10-29", 72, { INFY: "1500.05" });

// The caption shows in the row on a phone and in the As-of column on a wide screen.
const count = (screen: Awaited<ReturnType<typeof mount>>, text: RegExp) =>
  screen.getByText(text).elements().length;

describe("price captions", () => {
  it("values matched holdings and captions every kind of row in Accounts", async () => {
    const screen = await mount({ amfi: FRESH, nse: STALE }, <Accounts />);
    // 2950.123 × ₹29.7532 = ₹87,775.60; 3 × ₹1,500.05 = ₹4,500.15 (shown in rupees)
    const table = screen.getByRole("table", { name: "Investments" });
    await expect.element(table.getByText(/₹87,776/)).toBeVisible();
    await expect.element(table.getByText(/₹4,500/)).toBeVisible();
    // Section total: ₹87,775.60 + ₹4,500.15 + ₹1,000 manual = ₹93,275.75
    await expect.element(screen.getByText("₹93,276")).toBeVisible();
    await expect.poll(() => count(screen, /^as of 31 Oct$/)).toBeGreaterThan(0);
    await expect
      .poll(() => count(screen, /⚠ price stale · as of 29 Oct/))
      .toBeGreaterThan(0);
    await expect
      .poll(() => count(screen, /^manual value · 30 Oct$/))
      .toBeGreaterThan(0);
    // Cash is not priceable: its entered date only, never "manual value".
    expect(count(screen, /manual value/)).toBeLessThanOrEqual(2);
  });

  it("keeps the manual value when no universe is cached", async () => {
    const screen = await mount({}, <Accounts />);
    await expect
      .poll(() => count(screen, /^manual value · 30 Oct$/))
      .toBeGreaterThan(0);
    expect(count(screen, /as of/)).toBe(0);
  });

  it("shows the oldest price date in Goals, in the stale tone", async () => {
    const screen = await mount({ amfi: FRESH, nse: STALE }, <Goals />);
    // ₹87,775.60 + ₹4,500.15 + ₹1,000 manual + ₹5,000 cash = ₹98,275.75
    await expect.element(screen.getByText(/₹98,276 net worth/)).toBeVisible();
    await expect
      .element(screen.getByText(/⚠ prices stale · as of 29 Oct/))
      .toBeVisible();
  });
});
