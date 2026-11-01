// Home (#105, #138): zero-state until records exist, then the hero per lens and the sync indicator.
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { PlainRecord } from "@/crypto/record-codec";
import type { KeySession } from "@/features/lock/key-session";
import { SyncProvider } from "@/features/sync/sync-provider";
import type { HouseholdSync, SyncStatus } from "@/sync/household-sync";
import { Home } from "./home";
import { SyncIndicator } from "./sync-status";

const NO_PRICES = {};

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";

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

// Household: 10L joint FD (50/50) + 2L Asha's PPF + 3L Bala's savings − 40K Asha's card.
const HOUSEHOLD = [
  record("member", { memberId: BALA, name: "Bala" }, { modifiedBy: BALA }),
  record("asset", {
    ...common([
      { memberId: ASHA, shareBps: 5000 },
      { memberId: BALA, shareBps: 5000 },
    ]),
    kind: "fixedDeposit",
    name: "Joint FD",
    value: 10_00_000_00,
    issuer: "bank",
    payout: "cumulative",
    taxSaver: false,
    autoRenew: false,
  }),
  record("asset", {
    ...common([{ memberId: ASHA, shareBps: 10_000 }]),
    kind: "ppf",
    name: "Asha PPF",
    value: 2_00_000_00,
  }),
  record("asset", {
    ...common([{ memberId: BALA, shareBps: 10_000 }]),
    kind: "bankAccount",
    name: "Bala Savings",
    value: 3_00_000_00,
    accountType: "savings",
  }),
  record("liability", {
    ...common([{ memberId: ASHA, shareBps: 10_000 }]),
    kind: "creditCard",
    name: "Card",
    value: 40_000_00,
  }),
];

const SYNCED: SyncStatus = {
  state: "synced",
  lastSyncedAt: null,
  pending: false,
};

function fakeSync(records: PlainRecord[], status = SYNCED): HouseholdSync {
  return {
    householdId: "h",
    userId: ASHA,
    records: () => records,
    write: async () => ({}) as never,
    status: () => status,
    universes: () => NO_PRICES,
    sync: async () => ({}) as never,
    subscribe: () => () => {},
    stop() {},
  };
}

const mount = (sync: HouseholdSync) =>
  render(
    <SyncProvider keys={{} as KeySession} userId={ASHA} start={() => sync}>
      <Home household={<p>household panel</p>} addMore={<p>add more</p>} />
    </SyncProvider>,
  );

describe("Home", () => {
  it("leads with the empty state and keeps the invite form out of view", async () => {
    const screen = await render(<Home household={<p>household panel</p>} />);
    await expect
      .element(screen.getByText("Your household net worth will show up here"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Add your first account" }))
      .toBeDisabled();
    await expect
      .element(screen.getByText("household panel"))
      .not.toBeInTheDocument();
  });

  it("opens and closes the household panel from Invite a member", async () => {
    const screen = await render(<Home household={<p>household panel</p>} />);
    const action = screen.getByRole("button", { name: "Invite a member" });
    await expect.element(action).toHaveAttribute("aria-expanded", "false");
    await action.click();
    await expect.element(screen.getByText("household panel")).toBeVisible();
    await expect.element(action).toHaveAttribute("aria-expanded", "true");
    await action.click();
    await expect
      .element(screen.getByText("household panel"))
      .not.toBeInTheDocument();
  });

  it("replaces the zero-state with the household figure once records exist", async () => {
    const screen = await mount(fakeSync(HOUSEHOLD));
    await expect.element(screen.getByText("Household net worth")).toBeVisible();
    await expect.element(screen.getByText("₹14,60,000")).toBeVisible();
    await expect
      .element(screen.getByText("Assets ₹15,00,000 · Liabilities ₹40,000"))
      .toBeVisible();
    await expect.element(screen.getByText("add more")).toBeVisible();
    await expect
      .element(screen.getByText("Your household net worth will show up here"))
      .not.toBeInTheDocument();
  });

  it("re-computes in place for Me and for each named member", async () => {
    const screen = await mount(fakeSync(HOUSEHOLD));
    const lens = screen.getByRole("group", { name: "Whose net worth" });
    await expect
      .element(lens.getByRole("button", { name: "Household" }))
      .toHaveAttribute("aria-pressed", "true");

    await lens.getByRole("button", { name: "Me" }).click();
    await expect.element(screen.getByText("Your net worth")).toBeVisible();
    await expect.element(screen.getByText("₹6,60,000")).toBeVisible(); // 5L + 2L − 40K

    await lens.getByRole("button", { name: "Bala" }).click();
    await expect.element(screen.getByText("Bala's net worth")).toBeVisible();
    await expect.element(screen.getByText("₹8,00,000")).toBeVisible(); // 5L + 3L
  });

  it("counts what it can and says what it couldn't read", async () => {
    const screen = await mount(
      fakeSync([...HOUSEHOLD, record("asset", { kind: "nonsense" })]),
    );
    await expect.element(screen.getByText("₹14,60,000")).toBeVisible();
    await expect
      .element(
        screen.getByText(/1 record couldn't be read and isn't counted\./),
      )
      .toBeInTheDocument();
  });

  it("shows the sync indicator from the running sync", async () => {
    const screen = await mount(
      fakeSync(HOUSEHOLD, { ...SYNCED, state: "recovery", pending: true }),
    );
    await expect.element(screen.getByText(/Changes are waiting/)).toBeVisible();
  });
});

describe("SyncIndicator", () => {
  const at = (iso: string) => () => new Date(iso);

  it("is muted with the time of the last sync", async () => {
    const screen = await render(
      <SyncIndicator
        status={{ ...SYNCED, lastSyncedAt: new Date("2026-10-31T10:00:00Z") }}
        now={at("2026-10-31T10:02:30Z")}
      />,
    );
    await expect
      .element(screen.getByText(/Synced 2 min ago/))
      .toBeInTheDocument();
  });

  it("says when a sync is running", async () => {
    const screen = await render(
      <SyncIndicator status={{ ...SYNCED, state: "syncing" }} />,
    );
    await expect.element(screen.getByText(/Syncing…/)).toBeInTheDocument();
  });

  it("treats offline as information, not an error", async () => {
    const screen = await render(
      <SyncIndicator status={{ ...SYNCED, state: "offline", pending: true }} />,
    );
    await expect
      .element(screen.getByText(/You're offline/))
      .toBeInTheDocument();
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  it("points edits stuck behind the 409 at adding a recovery method", async () => {
    const screen = await render(
      <SyncIndicator
        status={{ ...SYNCED, state: "recovery", pending: true }}
      />,
    );
    await expect
      .element(screen.getByText(/Changes are waiting/))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: "Add one" }))
      .toHaveAttribute("href", "/settings");
  });

  it("renders nothing without a running sync", async () => {
    const screen = await render(<SyncIndicator />);
    expect(screen.container.textContent).toBe("");
  });
});
