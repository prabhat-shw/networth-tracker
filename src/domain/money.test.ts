import { describe, expect, it } from "vitest";
import { formatINR, paiseToRupees, rupeesToPaise, share, sum } from "./money";

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

describe("ownership share", () => {
  it("splits a joint account in half", () => {
    expect(share(rupeesToPaise(100000), 50)).toBe(rupeesToPaise(50000));
  });

  it("rounds to the nearest paisa", () => {
    expect(share(101, 50)).toBe(51);
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
