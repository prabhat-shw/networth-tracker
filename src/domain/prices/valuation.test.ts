import { describe, expect, it } from "vitest";
import { netWorth } from "../networth";
import { type AssetData, assetData } from "../records/asset";
import { type LiabilityData, liabilityData } from "../records/liability";
import type { Universe, Universes } from "./universe";
import { metalValue, priceSummary, valuation, valuedItems } from "./valuation";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const NOW = new Date("2026-11-01T12:00:00.000Z");
const FETCHED = "2026-11-01T02:00:00.000Z"; // 10 h before NOW

const base = (value: number) => ({
  owners: [
    { memberId: ASHA, shareBps: 6000 },
    { memberId: BALA, shareBps: 4000 },
  ],
  includeInNetWorth: true,
  tags: [],
  asOf: "2026-10-01",
  allocations: [],
  name: "Fixture",
  value,
});
const asset = (fields: object): AssetData =>
  assetData.parse({ ...base(1_00), ...fields });

const file = (
  kind: Universe["kind"],
  currency: string,
  prices: Record<string, string>,
  extra: Partial<Universe> = {},
): Universe => ({
  kind,
  date: "2026-10-31",
  fetchedAt: FETCHED,
  source: "fixture",
  currency,
  prices,
  ...extra,
});

const U: Universes = {
  amfi: file("amfi", "INR", { "119551": "29.7532" }),
  nse: file("nse", "INR", { INFY: "1500.05" }),
  us: file("us", "USD", { AAPL: "271.4", MSFT: "100" }),
  crypto: file("crypto", "USD", { SHIB: "0.000009123" }),
  fx: file("fx", "INR", { USD: "94.95" }),
  metal: file("metal", "INR", { gold999: "12345.67", silver999: "150.5" }),
};

const mf = (code: string) =>
  asset({
    kind: "mutualFund",
    plan: "direct",
    quantity: "2950.123",
    instrument: { source: "amfi", code },
  });

describe("valuation", () => {
  it("values MF units at the day's NAV", () => {
    // 2950.123 × ₹29.7532 = ₹87 775.5996… → ₹87 775.60
    expect(valuation(mf("119551"), U, NOW)).toEqual({
      source: "market",
      value: 87_775_60,
      asOf: "2026-10-31",
      stale: false,
    });
  });

  it("matches exchange codes without case", () => {
    const s = asset({
      kind: "stock",
      quantity: "3",
      instrument: { source: "nse", code: "infy" },
    });
    expect(valuation(s, U, NOW).value).toBe(4_500_15);
  });

  it("values US shares and tiny crypto prices via FX", () => {
    const us = asset({
      kind: "usStock",
      quantity: "12.5",
      instrument: { source: "us", code: "AAPL" },
    });
    const coin = asset({
      kind: "crypto",
      quantity: "1234567.5",
      instrument: { source: "crypto", code: "SHIB" },
    });
    expect(valuation(us, U, NOW).value).toBe(322_117_88);
    expect(valuation(coin, U, NOW).value).toBe(1_069_42);
  });

  it("values only vested RSU units", () => {
    const rsu = asset({
      kind: "rsu",
      plan: "rsu",
      vestingStart: "2025-01-01",
      schedule: "quarterly",
      quantity: "10",
      unvested: "30",
      instrument: { source: "us", code: "MSFT" },
    });
    // 10 × $100 × ₹94.95 = ₹94 950
    expect(valuation(rsu, U, NOW).value).toBe(94_950_00);
  });

  it("converts a foreign bank balance at the FX rate", () => {
    const bank = asset({
      kind: "foreignBank",
      currency: "USD",
      balanceMinor: 123_456,
    });
    // $1 234.56 × ₹94.95 = ₹117 221.472 → ₹117 221.47
    expect(valuation(bank, U, NOW)).toMatchObject({
      source: "market",
      value: 117_221_47,
    });
  });

  it("prorates gold by karat and prices silver at 999", () => {
    const gold = asset({
      kind: "preciousMetal",
      metal: "gold",
      form: "jewellery",
      weightMg: 10_000,
      karat: 22,
    });
    const silver = asset({
      kind: "preciousMetal",
      metal: "silver",
      form: "bar",
      weightMg: 100_000,
      karat: 18,
    });
    // 10 g × 22/24 × ₹12 345.67 = ₹113 168.6416… → ₹113 168.64
    expect(valuation(gold, U, NOW).value).toBe(113_168_64);
    expect(valuation(silver, U, NOW).value).toBe(15_050_00);
    expect(metalValue(1, 24, "0.005")).toBe(0);
    expect(metalValue(1, 24, "5")).toBe(1); // 0.5 paisa rounds up
  });

  it("falls back to the manual value when nothing matches", () => {
    const unweighed = asset({
      kind: "preciousMetal",
      metal: "gold",
      form: "coin",
      value: 7_00,
    });
    expect(valuation(mf("000000"), U, NOW)).toEqual({
      source: "manual",
      value: 1_00,
      priceable: true,
    });
    expect(valuation(mf("119551"), {}, NOW).source).toBe("manual");
    expect(valuation(unweighed, U, NOW)).toEqual({
      source: "manual",
      value: 7_00,
      priceable: true,
    });
    const us = asset({
      kind: "usStock",
      quantity: "1",
      instrument: { source: "us", code: "AAPL" },
    });
    expect(valuation(us, { us: U.us }, NOW).source).toBe("manual"); // no FX
    expect(valuation(asset({ kind: "ppf" }), U, NOW)).toMatchObject({
      source: "manual",
      priceable: false,
    });
  });

  it("turns stale 36 h after the file was fetched", () => {
    const at = (h: number) => new Date(Date.parse(FETCHED) + h * 3_600_000);
    expect(valuation(mf("119551"), U, at(36))).toMatchObject({
      stale: false,
    });
    expect(valuation(mf("119551"), U, at(36.01))).toMatchObject({
      stale: true,
    });
    const oldFx = {
      ...U,
      fx: { ...(U.fx as Universe), fetchedAt: "2026-10-20T00:00:00Z" },
    };
    const us = asset({
      kind: "usStock",
      quantity: "1",
      instrument: { source: "us", code: "AAPL" },
    });
    expect(valuation(us, oldFx, NOW)).toMatchObject({ stale: true });
  });

  it("uses a code's own price date", () => {
    const u = {
      amfi: file(
        "amfi",
        "INR",
        { "119551": "10" },
        { dates: { "119551": "2026-09-30" } },
      ),
    };
    expect(valuation(mf("119551"), u, NOW)).toMatchObject({
      asOf: "2026-09-30",
    });
  });
});

describe("valuedItems", () => {
  it("feeds netWorth with market values, to the paisa per lens", () => {
    const loan: LiabilityData = liabilityData.parse({
      ...base(10_000_00),
      kind: "borrowing",
      counterparty: "Uncle",
    });
    const items = valuedItems([mf("119551")], [loan], U, NOW);
    expect(netWorth(items, "household")).toEqual({
      assets: 87_775_60,
      liabilities: 10_000_00,
      net: 77_775_60,
    });
    // 60/40: ₹52 665.36 + ₹35 110.24 = ₹87 775.60
    expect(netWorth(items, { memberId: ASHA }).assets).toBe(52_665_36);
    expect(netWorth(items, { memberId: BALA }).assets).toBe(35_110_24);
  });
});

describe("priceSummary", () => {
  it("reports the oldest market date and any staleness", () => {
    expect(
      priceSummary([
        { source: "market", value: 1, asOf: "2026-10-31", stale: false },
        { source: "manual", value: 1, priceable: true },
        { source: "market", value: 1, asOf: "2026-10-30", stale: true },
      ]),
    ).toEqual({ asOf: "2026-10-30", stale: true });
    expect(
      priceSummary([{ source: "manual", value: 1, priceable: true }]),
    ).toEqual({
      stale: false,
    });
  });
});
