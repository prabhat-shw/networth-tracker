// Add anything (#135): buckets, search, the common form and the Owned-by split.
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { PlainRecord } from "@/crypto/record-codec";
import type { KeySession } from "@/features/lock/key-session";
import { SyncProvider } from "@/features/sync/sync-provider";
import type { HouseholdSync } from "@/sync/household-sync";
import { AddAnything } from "./add-anything";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";

/** Bala's self-written profile, so the split control can name them. */
const balaProfile: PlainRecord = {
  id: "1b000000-0000-4000-8000-0000000000b1",
  version: 1,
  deleted: false,
  type: "member",
  schemaVersion: 1,
  data: { memberId: BALA, name: "Bala" },
  modifiedAt: "2026-10-29T00:00:00.000Z",
  modifiedBy: BALA,
};

/** An in-memory sync: writes land in `records` and notify, like the real handle. */
function fakeSync(initial: PlainRecord[] = []) {
  let records = initial;
  const listeners = new Set<() => void>();
  const sync: HouseholdSync = {
    householdId: "h",
    userId: ASHA,
    records: () => records,
    async write(id, type, data, deleted = false, schemaVersion = 1) {
      const record: PlainRecord = {
        id,
        version: 1,
        deleted,
        type,
        schemaVersion,
        data,
        modifiedAt: new Date().toISOString(),
        modifiedBy: ASHA,
      };
      records = [...records.filter((r) => r.id !== id), record];
      for (const l of listeners) l();
      return record;
    },
    sync: async () => ({}) as never,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    stop() {},
  };
  return { sync, saved: () => records.filter((r) => r.type !== "member") };
}

const mount = (sync: HouseholdSync, ui = <AddAnything />) =>
  render(
    <SyncProvider keys={{} as KeySession} userId={ASHA} start={() => sync}>
      {ui}
    </SyncProvider>,
  );

const RETIRE = "9a000000-0000-4000-8000-000000000001";
const retireGoal: PlainRecord = {
  ...balaProfile,
  id: RETIRE,
  type: "goal",
  data: {
    kind: "retirement",
    name: "Retirement",
    targetAmount: 5_00_00_000_00,
    targetDate: "2050-01-01",
    inflationBps: 600,
    expectedReturnBps: 1000,
    priority: 1,
    owners: [{ memberId: ASHA, shareBps: 10_000 }],
  },
};

const FD_ID = "2a000000-0000-4000-8000-000000000001";
const storedFd = {
  kind: "fixedDeposit",
  name: "SBI FD",
  value: 1_00_000_00,
  owners: [{ memberId: ASHA, shareBps: 10_000 }],
  includeInNetWorth: true,
  tags: ["passbook"],
  asOf: "2026-10-01",
  allocations: [],
  nominees: [{ kind: "person", name: "Amma", shareBps: 10_000 }],
  issuer: "bank",
  payout: "cumulative",
  taxSaver: false,
  autoRenew: true,
  interestBps: 710,
};
const fdRecord: PlainRecord = {
  ...balaProfile,
  id: FD_ID,
  type: "asset",
  data: storedFd,
  modifiedBy: ASHA,
};

describe("AddAnything", () => {
  it("walks bucket → kind → form and saves a solo record", async () => {
    const { sync, saved } = fakeSync();
    const screen = await mount(sync);
    await screen.getByRole("button", { name: "Add" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "What is it?" }))
      .toBeVisible();
    await screen.getByRole("button", { name: "Deposits" }).click();
    await screen.getByRole("button", { name: "Fixed deposit" }).click();

    const save = screen.getByRole("button", { name: "Save", exact: true });
    await expect.element(save).toBeDisabled();
    await screen.getByLabelText("Name").fill("SBI FD");
    await screen.getByLabelText("Institution (optional)").fill("SBI");
    await screen.getByLabelText("Current value ₹").fill("1,50,000.50");
    await expect.element(screen.getByText("Just me")).toBeVisible();
    await save.click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(saved()).toHaveLength(1);
    expect(saved()[0]).toMatchObject({
      type: "asset",
      data: {
        kind: "fixedDeposit",
        name: "SBI FD",
        institution: "SBI",
        value: 15_000_050,
        owners: [{ memberId: ASHA, shareBps: 10_000 }],
      },
    });
  });

  it("finds kinds by search and says so when nothing matches", async () => {
    const screen = await mount(fakeSync().sync);
    await screen.getByRole("button", { name: "Add" }).click();
    const search = screen.getByRole("searchbox", { name: "Search" });
    await search.fill("platypus fund");
    await expect
      .element(screen.getByText("No match — browse categories below"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Investments" }))
      .toBeVisible();
    await search.fill("credit");
    await screen.getByRole("button", { name: "Credit card" }).click();
    await expect.element(screen.getByLabelText("Outstanding ₹")).toBeVisible();
  });

  it("splits Lending & Loans into owed-to-me and I-owe", async () => {
    const screen = await mount(fakeSync().sync);
    await screen.getByRole("button", { name: "Add" }).click();
    await screen.getByRole("button", { name: "Lending & Loans" }).click();
    await expect
      .element(screen.getByRole("region", { name: "I owe" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Money lent" }))
      .toBeEnabled();
    await screen.getByRole("button", { name: "Back" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "What is it?" }))
      .toBeVisible();
  });

  it("blocks Save until a joint split adds up to 100%", async () => {
    const { sync, saved } = fakeSync([balaProfile]);
    const screen = await mount(sync);
    await screen.getByRole("button", { name: "Add" }).click();
    await screen.getByRole("button", { name: "Cash & Bank" }).click();
    await screen.getByRole("button", { name: "Bank account" }).click();
    await screen.getByLabelText("Name").fill("Joint savings");
    await screen.getByLabelText("Current value ₹").fill("1000");
    await screen.getByRole("button", { name: "Change" }).click();
    await screen.getByRole("checkbox", { name: "Bala" }).click();
    await expect
      .element(screen.getByText("Shares add up to 100%"))
      .toBeVisible();

    await screen.getByLabelText("Your share").fill("60");
    await expect.element(screen.getByText("Over by 10%")).toBeVisible();
    const save = screen.getByRole("button", { name: "Save", exact: true });
    await expect.element(save).toBeDisabled();
    await screen.getByLabelText("Bala's share").fill("30");
    await expect.element(screen.getByText("10% left to assign")).toBeVisible();
    await screen.getByLabelText("Bala's share").fill("40");
    await expect.element(save).toBeEnabled();
    await save.click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(saved()[0]?.data).toMatchObject({
      kind: "bankAccount",
      owners: [
        { memberId: ASHA, shareBps: 6000 },
        { memberId: BALA, shareBps: 4000 },
      ],
    });
  });

  it("saves a priced kind with its own fields", async () => {
    const { sync, saved } = fakeSync();
    const screen = await mount(sync);
    await screen.getByRole("button", { name: "Add" }).click();
    await screen.getByRole("button", { name: "Investments" }).click();
    await screen.getByRole("button", { name: "Mutual fund" }).click();
    await screen.getByLabelText("Name").fill("Parag Parikh Flexi Cap");
    await screen.getByLabelText("Current value ₹").fill("250000");
    const save = screen.getByRole("button", { name: "Save", exact: true });
    await expect.element(save).toBeDisabled();
    await screen.getByLabelText("Units held").fill("2950.123");
    await screen.getByLabelText("Scheme code").fill("122639");
    await screen.getByLabelText("SIP ₹ per month (optional)").fill("10000");
    await save.click();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(saved()[0]?.data).toMatchObject({
      kind: "mutualFund",
      quantity: "2950.123",
      instrument: { source: "amfi", code: "122639" },
      plan: "direct",
      sip: 10_000_00,
    });
  });

  it("Save & add another returns to the same bucket", async () => {
    const { sync, saved } = fakeSync();
    const screen = await mount(sync);
    await screen.getByRole("button", { name: "Add" }).click();
    await screen.getByRole("button", { name: "Deposits" }).click();
    await screen.getByRole("button", { name: "Fixed deposit" }).click();
    await screen.getByLabelText("Name").fill("FD one");
    await screen.getByLabelText("Current value ₹").fill("1000");
    await screen.getByRole("button", { name: "Save & add another" }).click();
    await expect.element(screen.getByText("Saved FD one")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Deposits" }))
      .toBeVisible();
    await screen.getByRole("button", { name: "Fixed deposit" }).click();
    await expect.element(screen.getByLabelText("Name")).toHaveValue("");
    expect(saved()).toHaveLength(1);
  });

  it("tags a record to a goal by percent", async () => {
    const { sync, saved } = fakeSync([retireGoal]);
    const screen = await mount(sync);
    await screen.getByRole("button", { name: "Add" }).click();
    await screen
      .getByRole("button", { name: "Retirement & Small Savings" })
      .click();
    await screen.getByRole("button", { name: "PPF" }).click();
    await screen.getByLabelText("Name").fill("PPF");
    await screen.getByLabelText("Current value ₹").fill("500000");
    await screen
      .getByRole("combobox", { name: "Tag to goal" })
      .selectOptions(RETIRE);
    await screen.getByLabelText("Share for Retirement").fill("60");
    await screen.getByRole("button", { name: "Save", exact: true }).click();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(saved().find((r) => r.type === "asset")?.data).toMatchObject({
      allocations: [{ goalId: RETIRE, mode: "percent", bps: 6000 }],
    });
  });

  it("edits a record in place and keeps fields the form does not show", async () => {
    const { sync, saved } = fakeSync([fdRecord]);
    const screen = await mount(
      sync,
      <AddAnything label="Edit" editing={{ id: FD_ID, data: storedFd }} />,
    );
    await screen.getByRole("button", { name: "Edit" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "Edit Fixed deposit" }))
      .toBeVisible();
    const value = screen.getByLabelText("Current value ₹");
    const rate = screen.getByLabelText("Interest rate % (optional)");
    await expect.element(value).toHaveValue("100000");
    await expect.element(rate).toHaveValue("7.1");
    await expect
      .element(screen.getByRole("button", { name: "Save & add another" }))
      .not.toBeInTheDocument();
    await value.fill("105000");
    await rate.fill("");
    await screen.getByRole("button", { name: "Save", exact: true }).click();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(saved()).toHaveLength(1);
    expect(saved()[0]?.id).toBe(FD_ID);
    const data = saved()[0]?.data as Record<string, unknown>;
    expect(data).toMatchObject({
      value: 1_05_000_00,
      tags: ["passbook"],
      nominees: storedFd.nominees,
      autoRenew: true,
    });
    expect(data).not.toHaveProperty("interestBps");
  });

  it("deletes a record only after confirming", async () => {
    const { sync, saved } = fakeSync([fdRecord]);
    const screen = await mount(
      sync,
      <AddAnything label="Edit" editing={{ id: FD_ID, data: storedFd }} />,
    );
    await screen.getByRole("button", { name: "Edit" }).click();
    await screen.getByRole("button", { name: "Delete" }).click();
    expect(saved()[0]?.deleted).toBe(false);
    await screen
      .getByRole("button", { name: "Yes, delete for everyone" })
      .click();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(saved()[0]).toMatchObject({ id: FD_ID, deleted: true });
  });

  it("explains a rule the schema enforces", async () => {
    const screen = await mount(fakeSync().sync);
    await screen.getByRole("button", { name: "Add" }).click();
    await screen.getByRole("button", { name: "Insurance" }).click();
    await screen.getByRole("button", { name: "Life insurance policy" }).click();
    await screen.getByLabelText("Name").fill("LIC term");
    await screen.getByLabelText("Current value ₹").fill("1000");
    await screen.getByLabelText("Policy type").selectOptions("term");
    await screen.getByLabelText("Sum assured ₹").fill("10000000");
    await expect
      .element(screen.getByText("term cover is tracked at ₹0"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Save", exact: true }))
      .toBeDisabled();
  });
});
