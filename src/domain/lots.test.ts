import { describe, expect, it } from "vitest";
import { consumeFifo, fifoOrder } from "./lots";
import { assetData } from "./records/asset";
import { FULL_BPS, type Lot, lot } from "./records/common";
import { formatUnits, sumUnits, toUnits } from "./units";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";

const L = (
  quantity: string,
  cost: number,
  acquired: string,
  fmv2018?: number,
): Lot => ({
  quantity,
  cost,
  acquired,
  ...(fmv2018 === undefined ? {} : { fmv2018 }),
});

const fund = (quantity: string, lots?: Lot[]) => ({
  kind: "mutualFund",
  name: "Index fund",
  value: 1_00_000_00,
  owners: [{ memberId: ASHA, shareBps: FULL_BPS }],
  includeInNetWorth: true,
  tags: [],
  asOf: "2026-10-31",
  allocations: [],
  quantity,
  instrument: { source: "amfi", code: "120716" },
  plan: "direct",
  ...(lots ? { lots } : {}),
});

describe("units", () => {
  it("adds decimal units exactly and round-trips", () => {
    expect(sumUnits([{ quantity: "0.1" }, { quantity: "0.2" }])).toBe(
      toUnits("0.3"),
    );
    expect(formatUnits(toUnits("12.50000000"))).toBe("12.5");
    expect(formatUnits(toUnits("0.00000001"))).toBe("0.00000001");
    expect(formatUnits(toUnits("7"))).toBe("7");
  });
});

describe("lot schema", () => {
  it("takes a grandfathered value only for lots bought by 31 Jan 2018", () => {
    expect(
      lot.safeParse(L("10", 1_000_00, "2018-01-31", 1_500_00)).success,
    ).toBe(true);
    expect(
      lot.safeParse(L("10", 1_000_00, "2018-02-01", 1_500_00)).success,
    ).toBe(false);
  });

  it("rejects a lot of zero units", () => {
    expect(lot.safeParse(L("0", 0, "2020-01-01")).success).toBe(false);
  });

  it("lets a holding carry lots that add up to its units", () => {
    expect(assetData.safeParse(fund("10.5")).success).toBe(true);
    expect(
      assetData.safeParse(
        fund("10.5", [
          L("0.25", 25_00, "2019-01-01"),
          L("10.25", 1_000_00, "2020-01-01"),
        ]),
      ).success,
    ).toBe(true);
    const off = assetData.safeParse(
      fund("10.5", [L("10", 1_000_00, "2020-01-01")]),
    );
    expect(off.error?.issues[0]).toMatchObject({
      path: ["lots"],
      message: "lots must add up to the units held",
    });
  });

  it("fails on a bad quantity without throwing", () => {
    expect(
      assetData.safeParse(fund("abc", [L("1", 1_00, "2020-01-01")])).success,
    ).toBe(false);
  });
});

describe("consumeFifo", () => {
  const lots = [
    L("10", 3_000_00, "2021-06-01"),
    L("5", 1_000_00, "2017-03-01", 1_500_00),
    L("4", 1_600_00, "2021-06-01"),
  ];

  it("orders oldest first, keeping entry order on the same day", () => {
    expect(fifoOrder(lots).map((l) => l.quantity)).toEqual(["5", "10", "4"]);
  });

  it("sells whole lots oldest first", () => {
    const { sold, remaining } = consumeFifo(lots, "15");
    expect(sold).toEqual([lots[1], lots[0]]);
    expect(remaining).toEqual([lots[2]]);
  });

  it("splits a lot, keeping cost and FMV totals exact", () => {
    const { sold, remaining } = consumeFifo(
      [L("3", 1_000_00, "2017-03-01", 1_000_01)],
      "1",
    );
    expect(sold).toEqual([L("1", 333_33, "2017-03-01", 333_33)]);
    expect(remaining).toEqual([L("2", 666_67, "2017-03-01", 666_68)]);
  });

  it("handles fractional units", () => {
    const { sold, remaining } = consumeFifo(
      [L("1.5", 150_00, "2022-01-01")],
      "0.1",
    );
    expect(sold[0]).toEqual(L("0.1", 10_00, "2022-01-01"));
    expect(remaining[0].quantity).toBe("1.4");
    expect(sold[0].cost + remaining[0].cost).toBe(150_00);
  });

  it("selling nothing keeps everything; overselling throws", () => {
    expect(consumeFifo(lots, "0")).toEqual({
      sold: [],
      remaining: fifoOrder(lots),
    });
    expect(() => consumeFifo(lots, "19.00000001")).toThrow(RangeError);
    expect(consumeFifo(lots, "19").remaining).toEqual([]);
  });
});
