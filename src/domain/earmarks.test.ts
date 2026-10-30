import { describe, expect, it } from "vitest";
import {
  claims,
  type EarmarkSource,
  earmarks,
  unallocatedOf,
} from "./earmarks";
import type { Owner } from "./networth";
import type { Allocation } from "./records/common";

const HOUSE = "9a000000-0000-4000-8000-000000000001";
const EDU = "9a000000-0000-4000-8000-000000000002";
const GONE = "9a000000-0000-4000-8000-0000000000ff";
const GOALS = new Set([HOUSE, EDU]);

const pct = (goalId: string, bps: number): Allocation => ({
  goalId,
  mode: "percent",
  bps,
});
const fixed = (goalId: string, amount: number): Allocation => ({
  goalId,
  mode: "fixed",
  amount,
});
const ASHA = "1a000000-0000-4000-8000-000000000001";
const RAVI = "1a000000-0000-4000-8000-000000000002";
const SOLO: Owner[] = [{ memberId: ASHA, shareBps: 10_000 }];
const src = (
  side: EarmarkSource["side"],
  value: number,
  allocations: Allocation[] = [],
  includeInNetWorth = true,
  owners: Owner[] = SOLO,
): EarmarkSource => ({ side, value, allocations, includeInNetWorth, owners });

const L = 1_00_000_00; // ₹1 lakh in paise

describe("claims", () => {
  it("takes percent shares (rounded down) and fixed amounts as they are", () => {
    expect(claims([pct(HOUSE, 6000), fixed(EDU, 10_000_00)], 10 * L)).toEqual(
      new Map([
        [HOUSE, 6 * L],
        [EDU, 10_000_00],
      ]),
    );
    expect(claims([pct(HOUSE, 3333)], 100)).toEqual(new Map([[HOUSE, 33]]));
  });

  it("scales every claim down in proportion when they overshoot the value", () => {
    // A ₹5L fixed claim and 50% on a fund that has fallen to ₹4L: 5L + 2L = 7L claimed.
    const c = claims([fixed(HOUSE, 5 * L), pct(EDU, 5000)], 4 * L);
    expect(c.get(HOUSE)).toBe(Math.floor((5 * L * 4 * L) / (7 * L)));
    expect(c.get(EDU)).toBe(Math.floor((2 * L * 4 * L) / (7 * L)));
    expect((c.get(HOUSE) ?? 0) + (c.get(EDU) ?? 0)).toBeLessThanOrEqual(4 * L);
  });

  it("stays exact for crore-sized records, past 2^53 intermediates", () => {
    const value = 50_000 * 1_00_00_000_00; // ₹50,000 Cr
    const c = claims([fixed(HOUSE, value), fixed(EDU, value)], value);
    expect(c.get(HOUSE)).toBe(value / 2);
    expect(c.get(EDU)).toBe(value / 2);
  });

  it("claims nothing on a zero value, and drops zero claims", () => {
    expect(claims([fixed(HOUSE, L)], 0).size).toBe(0);
    expect(claims([pct(HOUSE, 1)], 99).size).toBe(0); // 0.0099 paise rounds to 0
  });
});

describe("unallocatedOf", () => {
  it("is what no goal claims, never below zero", () => {
    expect(unallocatedOf(src("asset", 10 * L, [pct(HOUSE, 2500)]))).toBe(
      7.5 * L,
    );
    expect(unallocatedOf(src("asset", L, [fixed(HOUSE, 2 * L)]))).toBe(0);
    expect(unallocatedOf(src("asset", L))).toBe(L);
  });
});

describe("earmarks", () => {
  it("nets a goal's liabilities against its assets (equity toward the house)", () => {
    const flat = src("asset", 80 * L, [pct(HOUSE, 10_000)]);
    const homeLoan = src("liability", 50 * L, [pct(HOUSE, 10_000)]);
    const fd = src("asset", 10 * L, [fixed(EDU, 4 * L)]);
    const e = earmarks([flat, homeLoan, fd], GOALS);
    expect(e.byGoal).toEqual(
      new Map([
        [HOUSE, 30 * L],
        [EDU, 4 * L],
      ]),
    );
    expect(e.unallocated).toBe(6 * L);
  });

  it("subtracts untagged debt from Unallocated, which may go negative", () => {
    const e = earmarks(
      [src("asset", 2 * L, [pct(HOUSE, 10_000)]), src("liability", 3 * L)],
      GOALS,
    );
    expect(e.unallocated).toBe(-3 * L);
  });

  it("adds up to net worth: earmarked plus Unallocated", () => {
    const sources = [
      src("asset", 12 * L, [pct(HOUSE, 3333), fixed(EDU, L)]),
      src("asset", 7 * L + 33, [pct(EDU, 5001)]),
      src("liability", 4 * L, [pct(HOUSE, 2500)]),
    ];
    const e = earmarks(sources, GOALS);
    const earmarked = [...e.byGoal.values()].reduce((a, b) => a + b, 0);
    expect(earmarked + e.unallocated).toBe(12 * L + 7 * L + 33 - 4 * L);
  });

  it("counts a claim on a deleted goal as Unallocated", () => {
    const e = earmarks([src("asset", L, [pct(GONE, 5000)])], GOALS);
    expect(e.byGoal.size).toBe(0);
    expect(e.unallocated).toBe(L);
  });

  it("skips records outside net worth entirely", () => {
    const e = earmarks(
      [src("asset", 5 * L, [pct(HOUSE, 10_000)], false)],
      GOALS,
    );
    expect(e).toEqual({ byGoal: new Map(), unallocated: 0 });
  });
});

describe("earmarks under a member's lens", () => {
  const joint = (a: number): Owner[] => [
    { memberId: ASHA, shareBps: a },
    { memberId: RAVI, shareBps: 10_000 - a },
  ];

  it("splits a fixed claim by ownership share, like the value", () => {
    // A 60/40 flat worth ₹80L, ₹20L of it fixed toward the house.
    const flat = src(
      "asset",
      80 * L,
      [fixed(HOUSE, 20 * L)],
      true,
      joint(6000),
    );
    const asha = earmarks([flat], GOALS, { memberId: ASHA });
    expect(asha.byGoal.get(HOUSE)).toBe(12 * L);
    expect(asha.unallocated).toBe(36 * L);
    const ravi = earmarks([flat], GOALS, { memberId: RAVI });
    expect(ravi.byGoal.get(HOUSE)).toBe(8 * L);
    expect(ravi.unallocated).toBe(24 * L);
  });

  it("gives a member nothing from a record they don't own", () => {
    const e = earmarks([src("asset", L, [pct(EDU, 5000)])], GOALS, {
      memberId: RAVI,
    });
    expect(e.byGoal.get(EDU)).toBe(0);
    expect(e.unallocated).toBe(0);
  });

  it("adds up across members to the household view, to the paisa", () => {
    const sources = [
      src(
        "asset",
        7 * L + 33,
        [pct(HOUSE, 3333), fixed(EDU, 1001)],
        true,
        joint(5000),
      ),
      src("liability", 3 * L + 1, [pct(HOUSE, 5000)], true, joint(3333)),
    ];
    const hh = earmarks(sources, GOALS);
    const a = earmarks(sources, GOALS, { memberId: ASHA });
    const r = earmarks(sources, GOALS, { memberId: RAVI });
    expect(a.unallocated + r.unallocated).toBe(hh.unallocated);
    for (const goal of GOALS)
      expect((a.byGoal.get(goal) ?? 0) + (r.byGoal.get(goal) ?? 0)).toBe(
        hh.byGoal.get(goal) ?? 0,
      );
  });
});
