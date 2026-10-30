import { describe, expect, it } from "vitest";
import {
  formatINR,
  paiseToRupees,
  rupeesToPaise,
  splitByWeight,
  sum,
} from "./money";

describe("paise conversion", () => {
  it("round-trips rupees without float drift", () => {
    expect(rupeesToPaise(1234567.89)).toBe(123456789);
    expect(paiseToRupees(123456789)).toBeCloseTo(1234567.89, 2);
  });

  it("sums exactly where floats would drift", () => {
    expect(sum([rupeesToPaise(0.1), rupeesToPaise(0.2)])).toBe(
      rupeesToPaise(0.3),
    );
  });
});

describe("splitByWeight", () => {
  const halves = [
    { key: "a", weight: 5000 },
    { key: "b", weight: 5000 },
  ];

  it("splits a joint account in half", () => {
    expect(splitByWeight(rupeesToPaise(100000), halves)).toEqual(
      new Map([
        ["a", rupeesToPaise(50000)],
        ["b", rupeesToPaise(50000)],
      ]),
    );
  });

  it("gives an odd paisa to the lowest key on a tie, so parts always add up", () => {
    expect(splitByWeight(101, halves)).toEqual(
      new Map([
        ["a", 51],
        ["b", 50],
      ]),
    );
  });

  it("gives leftover paise to the largest remainders", () => {
    const thirds = [
      { key: "a", weight: 3333 },
      { key: "b", weight: 3334 },
      { key: "c", weight: 3333 },
    ];
    const parts = splitByWeight(100, thirds);
    expect(parts).toEqual(
      new Map([
        ["a", 33],
        ["b", 34],
        ["c", 33],
      ]),
    );
    expect(splitByWeight(2, thirds)).toEqual(
      new Map([
        ["a", 1],
        ["b", 1],
        ["c", 0],
      ]),
    );
  });

  it("stays exact past 2^53 intermediate products", () => {
    const amount = 90_000 * 1_00_00_000 * 100; // ₹90,000 crore in paise
    const parts = splitByWeight(amount, [
      { key: "a", weight: 3333 },
      { key: "b", weight: 6667 },
    ]);
    expect((parts.get("a") ?? 0) + (parts.get("b") ?? 0)).toBe(amount);
    expect(parts.get("a")).toBe(29_997_000_000_000);
  });

  it("splits negative amounts so they still add up", () => {
    const parts = splitByWeight(-101, halves);
    expect((parts.get("a") ?? 0) + (parts.get("b") ?? 0)).toBe(-101);
  });

  it("returns nothing for zero total weight", () => {
    expect(splitByWeight(100, []).size).toBe(0);
  });
});

describe("Indian formatting", () => {
  it("groups digits the Indian way", () => {
    expect(formatINR(rupeesToPaise(1234567))).toBe("₹12,34,567");
  });

  it("renders lakh and crore compactly", () => {
    expect(formatINR(rupeesToPaise(1234567), { compact: true })).toBe(
      "₹12.35 L",
    );
    expect(formatINR(rupeesToPaise(23400000), { compact: true })).toBe(
      "₹2.34 Cr",
    );
    expect(formatINR(rupeesToPaise(500000), { compact: true })).toBe("₹5 L");
  });

  it("keeps the sign on negative net worth", () => {
    expect(formatINR(rupeesToPaise(-4500), { compact: true })).toBe("-₹4.5 K");
  });
});
