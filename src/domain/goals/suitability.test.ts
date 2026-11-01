import { describe, expect, it } from "vitest";
import type { AssetData } from "../records/asset";
import { type FundingSource, lockedUntil, suitability } from "./suitability";

const TODAY = "2026-11-01";
const src = (
  kind: FundingSource["kind"],
  extra: Partial<FundingSource> = {},
): FundingSource => ({
  recordId: kind,
  kind,
  claim: 100_000_00,
  ...extra,
});

describe("suitability", () => {
  it("flags volatile money funding a goal under three years away", () => {
    const near = { kind: "travel" as const, targetDate: "2028-05-01" };
    expect(
      suitability(near, [src("mutualFund"), src("bankAccount")], TODAY),
    ).toEqual([{ code: "volatileShortHorizon", recordId: "mutualFund" }]);
    const far = { kind: "travel" as const, targetDate: "2029-11-01" };
    expect(suitability(far, [src("stock")], TODAY)).toEqual([]);
  });

  it("flags a deposit that matures after the target date", () => {
    const goal = { kind: "house" as const, targetDate: "2030-01-01" };
    const fd = src("fixedDeposit", { lockedUntil: "2031-03-31" });
    expect(suitability(goal, [fd], TODAY)).toEqual([
      {
        code: "locksPastTarget",
        recordId: "fixedDeposit",
        until: "2031-03-31",
      },
    ]);
    expect(
      suitability(goal, [{ ...fd, lockedUntil: "2029-12-31" }], TODAY),
    ).toEqual([]);
  });

  it("flags EPF and NPS outside a retirement goal", () => {
    const edu = { kind: "education" as const, targetDate: "2040-06-01" };
    expect(suitability(edu, [src("epf")], TODAY)).toEqual([
      { code: "retirementLocked", recordId: "epf" },
    ]);
    expect(
      suitability({ ...edu, kind: "retirement" }, [src("nps")], TODAY),
    ).toEqual([]);
  });

  it("flags property funding an emergency fund", () => {
    const goal = { kind: "emergency" as const, targetDate: "2040-01-01" };
    expect(suitability(goal, [src("realEstate")], TODAY)).toEqual([
      { code: "illiquidEmergency", recordId: "realEstate" },
    ]);
  });

  it("skips a source with no claim", () => {
    const goal = { kind: "emergency" as const, targetDate: "2027-01-01" };
    expect(suitability(goal, [src("crypto", { claim: 0 })], TODAY)).toEqual([]);
  });
});

describe("lockedUntil", () => {
  it("reads the maturity date of kinds that carry one", () => {
    const fd = {
      kind: "fixedDeposit",
      maturityDate: "2030-01-01",
    } as AssetData;
    expect(lockedUntil(fd)).toBe("2030-01-01");
    expect(lockedUntil({ kind: "cash" } as AssetData)).toBeUndefined();
  });
});
