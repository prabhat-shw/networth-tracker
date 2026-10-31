import { describe, expect, it } from "vitest";
import { isPrice, marketValue } from "./price";
import { fxRate, lookup, type Universe, universe } from "./universe";

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
