import { describe, expect, it } from "vitest";
import {
  BUCKETS,
  bpsToPercent,
  KIND_OPTIONS,
  optionFor,
  optionsIn,
  parsePercent,
  parseRupees,
  searchKinds,
} from "./kinds";

describe("kind options", () => {
  it("places every kind in a bucket, with a label", () => {
    for (const b of BUCKETS) expect(optionsIn(b).length).toBeGreaterThan(0);
    expect(KIND_OPTIONS).toHaveLength(32);
    expect(optionFor("creditCard")?.type).toBe("liability");
  });
});

describe("searchKinds", () => {
  it("matches every word against the label and bucket", () => {
    expect(searchKinds("fixed").map((o) => o.kind)).toEqual(["fixedDeposit"]);
    expect(searchKinds("card credit").map((o) => o.kind)).toEqual([
      "creditCard",
    ]);
    expect(searchKinds("retirement").length).toBeGreaterThan(3);
  });

  it("finds nothing for nonsense or an empty query", () => {
    expect(searchKinds("platypus fund")).toEqual([]);
    expect(searchKinds("  ")).toEqual([]);
  });
});

describe("parseRupees", () => {
  it("reads rupees into paise without floats", () => {
    expect(parseRupees("12,34,567.89")).toBe(123456789);
    expect(parseRupees("0.1")).toBe(10);
    expect(parseRupees("500")).toBe(50000);
  });

  it("rejects what isn't an amount", () => {
    for (const bad of ["", "-5", "1.234", "abc", "1e5"])
      expect(parseRupees(bad), bad).toBeNull();
  });
});

describe("parsePercent", () => {
  it("reads percent into basis points", () => {
    expect(parsePercent("50")).toBe(5000);
    expect(parsePercent("33.33")).toBe(3333);
    expect(parsePercent("0.5")).toBe(50);
  });

  it("rejects over 100% and more than 2 decimals", () => {
    expect(parsePercent("100.01")).toBeNull();
    expect(parsePercent("1.234")).toBeNull();
  });

  it("formats basis points back without trailing zeros", () => {
    expect(bpsToPercent(5000)).toBe("50");
    expect(bpsToPercent(3333)).toBe("33.33");
    expect(bpsToPercent(50)).toBe("0.5");
    expect(bpsToPercent(10_000)).toBe("100");
  });
});
