// Tax lots in Add anything (#26, ADR-0063): lots must add up to the units held.
import { describe, expect, it } from "vitest";
import { fakeSync, mount } from "./test-sync";

type Screen = Awaited<ReturnType<typeof mount>>;

async function openFund(screen: Screen) {
  await screen.getByRole("button", { name: "Add" }).click();
  await screen.getByRole("button", { name: "Investments" }).click();
  await screen.getByRole("button", { name: "Mutual fund" }).click();
  await screen.getByLabelText("Name").fill("Index fund");
  await screen.getByLabelText("Current value ₹").fill("300000");
  await screen.getByLabelText("Units held").fill("150.5");
  await screen.getByLabelText("Scheme code").fill("120716");
  await screen.getByText("Tax lots (optional)").click();
}

describe("Tax lots", () => {
  it("records two lots, one grandfathered, once they add up", async () => {
    const { sync, saved } = fakeSync();
    const screen = await mount(sync);
    await openFund(screen);
    const add = screen.getByRole("button", { name: "+ Add a lot" });
    await add.click();
    await expect
      .element(screen.getByLabelText("Lot 1 units"))
      .toHaveValue("150.5");
    await screen.getByLabelText("Lot 1 units").fill("100");
    await screen.getByLabelText("Lot 1 cost ₹").fill("50000");
    await screen.getByLabelText("Lot 1 bought on").fill("2017-04-03");
    await screen
      .getByLabelText("Lot 1 value on 31 jan 2018 ₹")
      .fill("62000.50");
    const save = screen.getByRole("button", { name: "Save", exact: true });
    await add.click();
    await expect
      .element(screen.getByText("Enter the units for each lot"))
      .toBeVisible();
    await screen.getByLabelText("Lot 2 units").fill("40");
    await expect
      .element(screen.getByText("Lots hold 140 of 150.5 units"))
      .toBeVisible();
    await expect.element(save).toBeDisabled();
    await screen.getByLabelText("Lot 2 units").fill("50.5");
    await screen.getByLabelText("Lot 2 cost ₹").fill("40000");
    await expect
      .element(screen.getByText("Lots add up to the units held"))
      .toBeVisible();
    await expect
      .element(screen.getByLabelText("Lot 2 value on 31 jan 2018 ₹"))
      .not.toBeInTheDocument();
    await save.click();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(saved()[0]?.data).toMatchObject({
      quantity: "150.5",
      lots: [
        {
          quantity: "100",
          cost: 50_000_00,
          acquired: "2017-04-03",
          fmv2018: 62_000_50,
        },
        { quantity: "50.5", cost: 40_000_00 },
      ],
    });
  });

  it("removing every lot saves without the field", async () => {
    const { sync, saved } = fakeSync();
    const screen = await mount(sync);
    await openFund(screen);
    await screen.getByRole("button", { name: "+ Add a lot" }).click();
    await screen.getByRole("button", { name: "Remove lot 1" }).click();
    await screen.getByRole("button", { name: "Save", exact: true }).click();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(saved()[0]?.data).not.toHaveProperty("lots");
  });

  it("is not offered for a kind without a listing", async () => {
    const screen = await mount(fakeSync().sync);
    await screen.getByRole("button", { name: "Add" }).click();
    await screen.getByRole("button", { name: "Deposits" }).click();
    await screen.getByRole("button", { name: "Fixed deposit" }).click();
    await expect
      .element(screen.getByText("Tax lots (optional)"))
      .not.toBeInTheDocument();
  });
});
