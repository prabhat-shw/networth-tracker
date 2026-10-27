import { describe, expect, it } from "vitest";
import {
  allocatedPaise,
  allocations,
  allocationsFit,
  commonFields,
  FULL_BPS,
  nominees,
  owners,
  tags,
} from "./common";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const GOAL_HOUSE = "9a000000-0000-4000-8000-000000000001";
const GOAL_EDU = "9a000000-0000-4000-8000-000000000002";

const base = {
  owners: [{ memberId: ASHA, shareBps: FULL_BPS }],
  includeInNetWorth: true,
  tags: [],
  asOf: "2026-10-27",
  allocations: [],
};

describe("owners", () => {
  it("accepts a sole owner and a 50/50 or 60/40 split", () => {
    expect(owners.safeParse(base.owners).success).toBe(true);
    for (const [a, b] of [
      [5000, 5000],
      [6000, 4000],
      [3333, 6667],
    ])
      expect(
        owners.safeParse([
          { memberId: ASHA, shareBps: a },
          { memberId: BALA, shareBps: b },
        ]).success,
      ).toBe(true);
  });

  it("rejects shares that don't add up to exactly 100%", () => {
    for (const split of [
      [5000, 4999],
      [5000, 5001],
      [FULL_BPS, 1],
    ])
      expect(
        owners.safeParse([
          { memberId: ASHA, shareBps: split[0] },
          { memberId: BALA, shareBps: split[1] },
        ]).success,
      ).toBe(false);
  });

  it("rejects no owner, a repeated owner, a zero or fractional share", () => {
    expect(owners.safeParse([]).success).toBe(false);
    expect(
      owners.safeParse([
        { memberId: ASHA, shareBps: 5000 },
        { memberId: ASHA, shareBps: 5000 },
      ]).success,
    ).toBe(false);
    expect(
      owners.safeParse([
        { memberId: ASHA, shareBps: FULL_BPS },
        { memberId: BALA, shareBps: 0 },
      ]).success,
    ).toBe(false);
    expect(
      owners.safeParse([
        { memberId: ASHA, shareBps: 5000.5 },
        { memberId: BALA, shareBps: 4999.5 },
      ]).success,
    ).toBe(false);
  });

  it("only takes lowercase user ids, like modifiedBy", () => {
    expect(
      owners.safeParse([{ memberId: ASHA.toUpperCase(), shareBps: FULL_BPS }])
        .success,
    ).toBe(false);
    expect(
      owners.safeParse([{ memberId: "asha", shareBps: FULL_BPS }]).success,
    ).toBe(false);
  });
});

describe("allocations", () => {
  const pct = (goalId: string, bps: number) => ({
    goalId,
    mode: "percent" as const,
    bps,
  });
  const fixed = (goalId: string, amount: number) => ({
    goalId,
    mode: "fixed" as const,
    amount,
  });

  it("allows up to 100% across goals, never more", () => {
    expect(allocations.safeParse([]).success).toBe(true);
    expect(
      allocations.safeParse([pct(GOAL_HOUSE, 6000), pct(GOAL_EDU, 4000)])
        .success,
    ).toBe(true);
    expect(
      allocations.safeParse([pct(GOAL_HOUSE, 6000), pct(GOAL_EDU, 4001)])
        .success,
    ).toBe(false);
  });

  it("rejects a goal tagged twice, a zero share and a non-paise amount", () => {
    expect(
      allocations.safeParse([pct(GOAL_HOUSE, 1000), fixed(GOAL_HOUSE, 100)])
        .success,
    ).toBe(false);
    expect(allocations.safeParse([pct(GOAL_HOUSE, 0)]).success).toBe(false);
    expect(allocations.safeParse([fixed(GOAL_HOUSE, 10.5)]).success).toBe(
      false,
    );
    expect(allocations.safeParse([fixed(GOAL_HOUSE, 0)]).success).toBe(false);
  });

  it("claims percent shares rounded down, plus fixed amounts", () => {
    // ₹1,000.01 at 33.33% is 33 330.33 paise: rounds down to 33 330.
    const list = [pct(GOAL_HOUSE, 3333), fixed(GOAL_EDU, 50_000)];
    expect(allocatedPaise(list, 100_001)).toBe(33_330 + 50_000);
  });

  it("fits only inside the record's value", () => {
    const list = [pct(GOAL_HOUSE, 5000), fixed(GOAL_EDU, 50_000)];
    expect(allocationsFit(list, 100_000)).toBe(true); // 50 000 + 50 000
    expect(allocationsFit(list, 99_999)).toBe(true); // 50% rounds down: 49 999 + 50 000
    expect(allocationsFit(list, 99_998)).toBe(false); // 49 999 + 50 000 > 99 998
    expect(allocationsFit([], 0)).toBe(true);
    expect(allocationsFit([], -1)).toBe(false);
  });
});

describe("nominees", () => {
  it("takes members and named people whose shares add up to 100%", () => {
    expect(
      nominees.safeParse([
        { kind: "member", memberId: BALA, shareBps: 7000 },
        { kind: "person", name: "Ananya", shareBps: 3000 },
      ]).success,
    ).toBe(true);
    expect(
      nominees.safeParse([{ kind: "person", name: "Ananya", shareBps: 9000 }])
        .success,
    ).toBe(false);
  });

  it("rejects an empty list (omit the field instead) and a repeated nominee", () => {
    expect(nominees.safeParse([]).success).toBe(false);
    expect(
      nominees.safeParse([
        { kind: "person", name: "Ananya", shareBps: 5000 },
        { kind: "person", name: "Ananya", shareBps: 5000 },
      ]).success,
    ).toBe(false);
  });
});

describe("commonFields", () => {
  it("parses the minimal record and trims text", () => {
    const parsed = commonFields.parse({
      ...base,
      institution: "  HDFC Bank ",
      tags: ["joint"],
    });
    expect(parsed.institution).toBe("HDFC Bank");
  });

  it("rejects an impossible date and a timestamp", () => {
    for (const asOf of ["2026-02-30", "2026-10-27T10:00:00Z", "27/10/2026"])
      expect(commonFields.safeParse({ ...base, asOf }).success).toBe(false);
  });

  it("rejects a field this version doesn't define, instead of dropping it", () => {
    expect(
      commonFields.safeParse({ ...base, addedByANewerApp: 1 }).success,
    ).toBe(false);
  });

  it("requires the fields every record carries", () => {
    for (const key of Object.keys(base)) {
      const { [key as keyof typeof base]: _, ...rest } = base;
      expect(commonFields.safeParse(rest).success).toBe(false);
    }
  });

  it("treats tags case-insensitively for repeats", () => {
    expect(tags.safeParse(["Joint", "joint"]).success).toBe(false);
    expect(tags.safeParse([" "]).success).toBe(false);
  });
});
