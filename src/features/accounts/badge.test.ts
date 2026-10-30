import { describe, expect, it } from "vitest";
import { ownershipBadge, taggedPercent } from "./badge";

const ME = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const CHITRA = "0c000000-0000-4000-8000-0000000000c1";
const NAMES: Record<string, string> = { [BALA]: "Bala", [CHITRA]: "Chitra" };
const nameOf = (id: string) => NAMES[id] ?? "Former member";
const GOAL = "9a000000-0000-4000-8000-000000000001";

describe("ownershipBadge", () => {
  it("shows nothing for a record that is all mine", () => {
    expect(
      ownershipBadge([{ memberId: ME, shareBps: 10_000 }], ME, nameOf),
    ).toBeNull();
  });

  it("names the owner of someone else's record", () => {
    expect(
      ownershipBadge([{ memberId: BALA, shareBps: 10_000 }], ME, nameOf),
    ).toBe("Bala's");
  });

  it("lists my share first, then who I share with", () => {
    expect(
      ownershipBadge(
        [
          { memberId: BALA, shareBps: 4000 },
          { memberId: ME, shareBps: 6000 },
        ],
        ME,
        nameOf,
      ),
    ).toBe("◐ 60/40 · Bala");
  });

  it("handles splits I'm not in, and former members", () => {
    expect(
      ownershipBadge(
        [
          { memberId: BALA, shareBps: 3333 },
          { memberId: CHITRA, shareBps: 3334 },
          { memberId: "0f000000-0000-4000-8000-0000000000f1", shareBps: 3333 },
        ],
        ME,
        nameOf,
      ),
    ).toBe("◐ 33.33/33.34/33.33 · Bala, Chitra, Former member");
  });
});

describe("taggedPercent", () => {
  it("rounds down and caps at 100", () => {
    expect(
      taggedPercent([{ goalId: GOAL, mode: "percent", bps: 4050 }], 1000),
    ).toBe(40);
    expect(
      taggedPercent([{ goalId: GOAL, mode: "fixed", amount: 5000 }], 1000),
    ).toBe(100);
    expect(taggedPercent([], 1000)).toBe(0);
    expect(taggedPercent([{ goalId: GOAL, mode: "fixed", amount: 1 }], 0)).toBe(
      0,
    );
  });
});
