import { describe, expect, it } from "vitest";
import { assetData } from "@/domain/records/asset";
import { liabilityData } from "@/domain/records/liability";
import {
  BUCKETS,
  bpsToPercent,
  KIND_OPTIONS,
  optionsIn,
  parsePercent,
  parseRupees,
  searchKinds,
} from "./kinds";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";

describe("kind options", () => {
  it("gives every bucket at least one kind that can be saved today", () => {
    for (const b of BUCKETS)
      expect(optionsIn(b).some((o) => o.defaults !== null)).toBe(true);
  });

  it("has defaults that make a valid record with the common fields", () => {
    for (const o of KIND_OPTIONS) {
      if (!o.defaults) continue;
      const data = {
        kind: o.kind,
        name: "Test",
        value: 100,
        owners: [{ memberId: ASHA, shareBps: 10_000 }],
        includeInNetWorth: true,
        tags: [],
        asOf: "2026-10-30",
        allocations: [],
        ...o.defaults,
      };
      const schema = o.type === "asset" ? assetData : liabilityData;
      expect(schema.safeParse(data).success, o.kind).toBe(true);
    }
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
