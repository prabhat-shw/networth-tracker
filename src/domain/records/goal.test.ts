import { describe, expect, it } from "vitest";
import { FULL_BPS } from "./common";
import { readRecord } from "./evolution";
import {
  DEFAULT_INFLATION_BPS,
  GOAL_CODEC,
  GOAL_KINDS,
  goalData,
} from "./goal";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";

const goal = {
  kind: "education",
  name: "Ananya's college",
  targetAmount: 25_00_000_00, // ₹25 L in today's rupees
  targetDate: "2040-06-01",
  inflationBps: DEFAULT_INFLATION_BPS.education,
  expectedReturnBps: 1100,
  priority: 1,
  owners: [{ memberId: ASHA, shareBps: FULL_BPS }],
};

describe("goalData", () => {
  it("parses every kind", () => {
    for (const kind of GOAL_KINDS)
      expect(goalData.safeParse({ ...goal, kind }).success).toBe(true);
  });

  it("defaults inflation to 6%, and 10% for education (PLAN.md §1.1)", () => {
    expect(DEFAULT_INFLATION_BPS.education).toBe(1000);
    for (const kind of GOAL_KINDS.filter((k) => k !== "education"))
      expect(DEFAULT_INFLATION_BPS[kind]).toBe(600);
  });

  it("refuses a non-paise or zero target, and rates past 100%", () => {
    for (const bad of [
      { targetAmount: 100.5 },
      { targetAmount: 0 },
      { inflationBps: 10_001 },
      { expectedReturnBps: -1 },
      { inflationBps: 6.5 },
    ])
      expect(goalData.safeParse({ ...goal, ...bad }).success).toBe(false);
  });

  it("checks priority, colour slot, date and owners", () => {
    for (const bad of [
      { priority: 0 },
      { priority: 6 },
      { colour: 9 },
      { targetDate: "2040-13-01" },
      { owners: [] },
      { kind: "yacht" },
      { colour: 3, extra: true },
    ])
      expect(goalData.safeParse({ ...goal, ...bad }).success).toBe(false);
    expect(goalData.safeParse({ ...goal, colour: 8 }).success).toBe(true);
  });

  it("reads through readRecord at v1", () => {
    expect(
      readRecord(
        { goal: GOAL_CODEC },
        { type: "goal", schemaVersion: 1, data: goal },
      ),
    ).toEqual({ status: "ok", value: goal, upgraded: false });
  });
});
