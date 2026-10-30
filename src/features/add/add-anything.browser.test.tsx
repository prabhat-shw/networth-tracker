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

const mount = (sync: HouseholdSync) =>
  render(
    <SyncProvider keys={{} as KeySession} userId={ASHA} start={() => sync}>
      <AddAnything />
    </SyncProvider>,
  );

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

    const save = screen.getByRole("button", { name: "Save" });
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

  it("splits Lending & Loans into owed-to-me and I-owe, with unready kinds disabled", async () => {
    const screen = await mount(fakeSync().sync);
    await screen.getByRole("button", { name: "Add" }).click();
    await screen.getByRole("button", { name: "Lending & Loans" }).click();
    await expect
      .element(screen.getByRole("region", { name: "I owe" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /Money lent/ }))
      .toBeDisabled();
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
    const save = screen.getByRole("button", { name: "Save" });
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
});
