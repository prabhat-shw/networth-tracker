// Nominees in Add anything (#25, ADR-0061): members or named people, shares to 100%.
import { describe, expect, it } from "vitest";
import type { PlainRecord } from "@/crypto/record-codec";
import { AddAnything } from "./add-anything";
import { ASHA, BALA, balaProfile, fakeSync, mount } from "./test-sync";

type Screen = Awaited<ReturnType<typeof mount>>;

async function openFd(screen: Screen) {
  await screen.getByRole("button", { name: "Add" }).click();
  await screen.getByRole("button", { name: "Deposits" }).click();
  await screen.getByRole("button", { name: "Fixed deposit" }).click();
  await screen.getByLabelText("Name").fill("SBI FD");
  await screen.getByLabelText("Current value ₹").fill("1000");
  await screen.getByText("Nominees (optional)").click();
}

const FD_ID = "2a000000-0000-4000-8000-000000000001";
const storedFd = {
  kind: "fixedDeposit",
  name: "SBI FD",
  value: 1_00_000_00,
  owners: [{ memberId: ASHA, shareBps: 10_000 }],
  includeInNetWorth: true,
  tags: [],
  asOf: "2026-10-01",
  allocations: [],
  nominees: [{ kind: "person", name: "Amma", shareBps: 10_000 }],
  issuer: "bank",
  payout: "cumulative",
  taxSaver: false,
  autoRenew: false,
};
const fdRecord: PlainRecord = {
  ...balaProfile,
  id: FD_ID,
  type: "asset",
  data: storedFd,
  modifiedBy: ASHA,
};

describe("Nominees", () => {
  it("records a member and a named person, split evenly", async () => {
    const { sync, saved } = fakeSync([balaProfile]);
    const screen = await mount(sync);
    await openFd(screen);
    const add = screen.getByRole("combobox", { name: "Add a nominee" });
    await add.selectOptions("Bala");
    await add.selectOptions("Someone else…");
    await screen.getByLabelText("Nominee 2 name").fill("Amma");
    await expect
      .element(screen.getByLabelText("Share for Bala"))
      .toHaveValue("50");
    await expect
      .element(screen.getByLabelText("Share for Amma"))
      .toHaveValue("50");
    await expect
      .element(screen.getByText("Shares add up to 100%").nth(0))
      .toBeVisible();
    await screen.getByRole("button", { name: "Save", exact: true }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(saved()[0]?.data).toMatchObject({
      nominees: [
        { kind: "member", memberId: BALA, shareBps: 5000 },
        { kind: "person", name: "Amma", shareBps: 5000 },
      ],
    });
  });

  it("blocks Save until shares add up and a person is named", async () => {
    const { sync } = fakeSync([balaProfile]);
    const screen = await mount(sync);
    await openFd(screen);
    const save = screen.getByRole("button", { name: "Save", exact: true });
    const add = screen.getByRole("combobox", { name: "Add a nominee" });
    await add.selectOptions("Me");
    await add.selectOptions("Someone else…");
    await expect.element(save).toBeDisabled();
    await screen.getByLabelText("Nominee 2 name").fill("Amma");
    await expect.element(save).toBeEnabled();
    await screen.getByLabelText("Share for Me").fill("70");
    await expect.element(screen.getByText("Over by 20%")).toBeVisible();
    await expect.element(save).toBeDisabled();
    await screen.getByLabelText("Share for Amma").fill("30");
    await expect.element(save).toBeEnabled();
  });

  it("drops the field when the last nominee is removed on edit", async () => {
    const { sync, saved } = fakeSync([fdRecord]);
    const screen = await mount(
      sync,
      <AddAnything label="Edit" editing={{ id: FD_ID, data: storedFd }} />,
    );
    await screen.getByRole("button", { name: "Edit" }).click();
    await expect
      .element(screen.getByLabelText("Nominee 1 name"))
      .toHaveValue("Amma");
    await screen.getByRole("button", { name: "Remove Amma" }).click();
    await screen.getByRole("button", { name: "Save", exact: true }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(saved()[0]?.data).not.toHaveProperty("nominees");
  });

  it("is not offered on a liability", async () => {
    const { sync } = fakeSync();
    const screen = await mount(sync);
    await screen.getByRole("button", { name: "Add" }).click();
    await screen.getByRole("searchbox", { name: "Search" }).fill("credit card");
    await screen.getByRole("button", { name: "Credit card" }).click();
    await expect.element(screen.getByLabelText("Name")).toBeVisible();
    await expect
      .element(screen.getByText("Nominees (optional)"))
      .not.toBeInTheDocument();
  });
});
