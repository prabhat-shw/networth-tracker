// Instrument picker (#170): search the cached universes, show today's price, fill the value.
import { describe, expect, it, vi } from "vitest";
import type { Universe, Universes } from "@/domain/prices/universe";
import { fakeSync, mount } from "./test-sync";

const file = (
  kind: Universe["kind"],
  currency: string,
  prices: Record<string, string>,
  names?: Record<string, string>,
): Universe => ({
  kind,
  date: "2026-10-31",
  fetchedAt: new Date().toISOString(),
  source: "fixture",
  currency,
  prices,
  names,
});

const U: Universes = {
  amfi: file(
    "amfi",
    "INR",
    { "122639": "29.7532", "119551": "60.1" },
    {
      "122639": "Parag Parikh Flexi Cap Fund - Direct Plan - Growth",
      "119551": "Axis Bluechip Fund - Direct Plan - Growth",
    },
  ),
  nse: file("nse", "INR", { INFY: "1500.05" }),
  bse: file("bse", "INR", { INFY: "1499.9" }),
  us: file("us", "USD", { AAPL: "271.4" }),
  fx: file("fx", "INR", { USD: "94.95" }),
};

async function openFund(universes: Universes = U) {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const { sync, saved } = fakeSync([], universes);
  const screen = await mount(sync);
  await screen.getByRole("button", { name: "Add" }).click();
  await screen.getByRole("button", { name: "Investments" }).click();
  await screen.getByRole("button", { name: "Mutual fund" }).click();
  await screen.getByLabelText("Name").fill("Flexi cap");
  return { screen, saved, fetchSpy };
}

describe("InstrumentPicker", () => {
  it("finds a fund by name on the device and fills the value from the units", async () => {
    const { screen, saved, fetchSpy } = await openFund();
    await screen.getByLabelText("Units held").fill("2950.123");
    await screen.getByLabelText("Scheme code").fill("parag flexi");
    const list = screen.getByRole("list", { name: "Scheme code matches" });
    await list.getByRole("button", { name: /Parag Parikh Flexi Cap/ }).click();
    await expect
      .element(screen.getByLabelText("Scheme code"))
      .toHaveValue("122639");
    await expect
      .element(screen.getByText(/Today ₹29.7532 per unit · as of 31 Oct/))
      .toBeVisible();
    // 2950.123 × ₹29.7532 = ₹87,775.60
    await expect
      .element(screen.getByLabelText("Current value ₹"))
      .toHaveValue("87775.6");
    await screen.getByRole("button", { name: "Save", exact: true }).click();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(saved()[0]?.data).toMatchObject({
      instrument: { source: "amfi", code: "122639" },
      value: 87_775_60,
    });
    expect(fetchSpy).not.toHaveBeenCalled(); // the search never leaves the device
    fetchSpy.mockRestore();
  });

  it("offers today's value for a typed code once units change", async () => {
    const { screen } = await openFund();
    await screen.getByLabelText("Scheme code").fill("119551");
    await screen.getByLabelText("Units held").fill("10");
    await screen.getByRole("button", { name: "Use ₹601 as the value" }).click();
    await expect
      .element(screen.getByLabelText("Current value ₹"))
      .toHaveValue("601");
  });

  it("keeps an unmatched code with the manual value", async () => {
    const { screen, saved } = await openFund();
    await screen.getByLabelText("Units held").fill("5");
    await screen.getByLabelText("Scheme code").fill("999999");
    await expect
      .element(screen.getByText(/No price found for this code/))
      .toBeVisible();
    await screen.getByLabelText("Current value ₹").fill("1234");
    await screen.getByRole("button", { name: "Save", exact: true }).click();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(saved()[0]?.data).toMatchObject({
      instrument: { source: "amfi", code: "999999" },
      value: 1_234_00,
    });
  });

  it("says when no prices are downloaded yet", async () => {
    const { screen } = await openFund({});
    await screen.getByLabelText("Scheme code").fill("122639");
    await expect
      .element(screen.getByText(/Prices aren't downloaded yet/))
      .toBeVisible();
  });

  it("switches the exchange to the picked match", async () => {
    const { sync } = fakeSync([], U);
    const screen = await mount(sync);
    await screen.getByRole("button", { name: "Add" }).click();
    await screen.getByRole("button", { name: "Investments" }).click();
    await screen.getByRole("button", { name: "Indian stocks" }).click();
    await screen.getByLabelText("Units held").fill("3");
    await screen.getByLabelText("Symbol").fill("INFY");
    const list = screen.getByRole("list", { name: "Symbol matches" });
    await list.getByRole("button", { name: /₹1499.9/ }).click();
    await expect.element(screen.getByLabelText("Exchange")).toHaveValue("bse");
    await expect
      .element(screen.getByLabelText("Current value ₹"))
      .toHaveValue("4499.7");
  });
});
