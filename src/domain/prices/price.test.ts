import { describe, expect, it } from "vitest";
import { isPrice, marketValue, priceFromNumber, ratio } from "./price";
import {
  fxRate,
  lookup,
  settleDates,
  type Universe,
  universe,
} from "./universe";

describe("marketValue", () => {
  it("values fractional MF units at a 4-decimal NAV", () => {
    // 2950.123 × ₹29.7532 = ₹87 775.5996… → ₹87 775.60
    expect(marketValue("2950.123", "29.7532")).toBe(87_775_60);
  });

  it("values a tiny crypto price via USD", () => {
    // 1 234 567.5 × $0.000009123 × ₹94.95 = ₹1 069.4205… → ₹1 069.42
    expect(marketValue("1234567.5", "0.000009123", "94.95")).toBe(1_069_42);
  });

  it("values US shares via FX", () => {
    // 12.5 × $271.40 × ₹94.95 = ₹322 117.875 → ₹322 117.88 (half-up)
    expect(marketValue("12.5", "271.4", "94.95")).toBe(322_117_88);
  });

  it("rounds once, half-up, at the paisa", () => {
    expect(marketValue("1", "0.004")).toBe(0);
    expect(marketValue("1", "0.005")).toBe(1);
    expect(marketValue("3", "0.00166666")).toBe(0);
    // Rounding each unit first would give 3 × 0 = 0; rounding once gives 1.
    expect(marketValue("3", "0.0017")).toBe(1);
    expect(marketValue("0", "123.45")).toBe(0);
  });

  it("rejects malformed inputs and overflow", () => {
    expect(() => marketValue("1", "-1")).toThrow(RangeError);
    expect(() => marketValue("1", "1e5")).toThrow(RangeError);
    expect(() => marketValue("999999999999999", "999999999999999")).toThrow(
      RangeError,
    );
  });

  it("accepts up to 12 price decimals", () => {
    expect(isPrice("0.000000000001")).toBe(true);
    expect(isPrice("0.0000000000001")).toBe(false);
  });
});

const day: Universe = {
  kind: "nse",
  date: "2026-10-30",
  fetchedAt: "2026-10-30T18:05:00.000Z",
  source: "NSE bhavcopy",
  currency: "INR",
  prices: { RELIANCE: "1432.1", GOLDBEES: "98.27" },
};

describe("universe", () => {
  it("parses a universe file and rejects a bad price", () => {
    expect(universe.safeParse(day).success).toBe(true);
    expect(universe.safeParse({ ...day, prices: { X: "12,5" } }).success).toBe(
      false,
    );
  });

  it("looks up a code without case, and never a prototype key", () => {
    expect(lookup({ nse: day }, { source: "nse", code: " reliance" })).toEqual({
      price: "1432.1",
      currency: "INR",
      date: "2026-10-30",
    });
    expect(lookup({ nse: day }, { source: "nse", code: "constructor" })).toBe(
      undefined,
    );
    expect(lookup({ nse: day }, { source: "bse", code: "RELIANCE" })).toBe(
      undefined,
    );
  });

  it("gives INR as 1 and other currencies from the FX universe", () => {
    const fx = { ...day, kind: "fx" as const, prices: { USD: "94.95" } };
    expect(fxRate({}, "INR")).toBe("1");
    expect(fxRate({ fx }, "USD")).toBe("94.95");
    expect(fxRate({ fx }, "EUR")).toBe(undefined);
    expect(fxRate({}, "USD")).toBe(undefined);
  });
});

describe("priceFromNumber and ratio", () => {
  it("spells a JSON number exactly, expanding exponents", () => {
    expect(priceFromNumber(344.63)).toBe("344.63");
    expect(priceFromNumber(77614)).toBe("77614");
    expect(priceFromNumber(0)).toBe("0");
    expect(priceFromNumber(3.53699e-7)).toBe("0.000000353699");
    expect(priceFromNumber(1.5e-12)).toBe("0.000000000002");
    expect(priceFromNumber(1.4e-12)).toBe("0.000000000001");
    expect(priceFromNumber(1.2e21)).toBe(undefined);
    expect(priceFromNumber(1e14)).toBe("100000000000000");
  });

  it("refuses negatives, non-numbers and non-finite values", () => {
    for (const n of [-1, Number.NaN, Number.POSITIVE_INFINITY, "1", null])
      expect(priceFromNumber(n)).toBe(undefined);
  });

  it("divides at 12 decimals, rounding half-up, and refuses 0", () => {
    expect(ratio("106.084", "1.1172")).toBe("94.955245255997");
    expect(ratio("2", "3")).toBe("0.666666666667");
    expect(ratio("181344", "1000")).toBe("181.344");
    expect(() => ratio("1", "0")).toThrow(RangeError);
  });
});

describe("settleDates", () => {
  it("picks the most common date, the latest on a tie, and lists the rest", () => {
    expect(
      settleDates({ A: "2026-10-30", B: "2026-10-30", C: "2026-10-27" }),
    ).toEqual({ date: "2026-10-30", dates: { C: "2026-10-27" } });
    expect(settleDates({ A: "2026-10-29", B: "2026-10-30" })).toEqual({
      date: "2026-10-30",
      dates: { A: "2026-10-29" },
    });
    expect(settleDates({})).toBe(undefined);
  });
});
