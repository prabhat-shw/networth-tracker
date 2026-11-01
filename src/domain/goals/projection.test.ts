import { describe, expect, it } from "vitest";
import {
  type GoalInput,
  goalStatus,
  inflatedTarget,
  monthsUntil,
  projectedCorpus,
  projectGoal,
  requiredMonthlySip,
} from "./projection";

// Fixtures checked with Python's `decimal` at 50 digits.
const LAKH = 100_000 * 100;

describe("monthsUntil", () => {
  it("counts whole calendar months", () => {
    expect(monthsUntil("2026-11-01", "2027-11-01")).toBe(12);
    expect(monthsUntil("2026-11-01", "2027-10-31")).toBe(11);
    expect(monthsUntil("2026-01-31", "2026-02-28")).toBe(0);
  });

  it("is 0 for a date already past", () => {
    expect(monthsUntil("2026-11-01", "2025-01-01")).toBe(0);
  });
});

describe("inflatedTarget", () => {
  it("compounds annually in today's rupees", () => {
    expect(inflatedTarget(10 * LAKH, 600, 120)).toBe(179_084_770);
    expect(inflatedTarget(50 * LAKH, 1000, 168)).toBe(1_898_749_168);
  });

  it("is the target itself at zero inflation", () => {
    expect(inflatedTarget(10 * LAKH, 0, 120)).toBe(10 * LAKH);
  });
});

describe("projectedCorpus", () => {
  it("grows the lump and a month-end SIP", () => {
    expect(projectedCorpus(20 * LAKH, 10_000 * 100, 1000, 120)).toBe(
      718_612_349,
    );
  });

  it("adds the SIP flat at zero return", () => {
    expect(projectedCorpus(LAKH, 1_000 * 100, 0, 12)).toBe(LAKH + 12_000 * 100);
  });
});

describe("requiredMonthlySip", () => {
  it("rounds up to the paisa", () => {
    expect(requiredMonthlySip(10 * LAKH, 0, 1200, 60)).toBe(1_244_691);
  });

  it("is always enough, and a paisa less is not", () => {
    for (const [target, present, bps, months] of [
      [10 * LAKH, 0, 1200, 60],
      [190 * LAKH, 478_000_00, 1000, 168],
      [3 * LAKH, 50_000_00, 700, 7],
    ]) {
      const sip = requiredMonthlySip(target, present, bps, months) as number;
      expect(projectedCorpus(present, sip, bps, months)).toBeGreaterThanOrEqual(
        target,
      );
      expect(projectedCorpus(present, sip - 1, bps, months)).toBeLessThan(
        target,
      );
    }
  });

  it("divides evenly at zero return", () => {
    expect(requiredMonthlySip(12 * LAKH, 0, 0, 12)).toBe(LAKH);
  });

  it("is 0 when the money already there grows past the target", () => {
    expect(requiredMonthlySip(10 * LAKH, 9 * LAKH, 1000, 24)).toBe(0);
    expect(requiredMonthlySip(10 * LAKH, 10 * LAKH, 0, 1)).toBe(0);
  });

  it("refuses a target with no months left", () => {
    expect(requiredMonthlySip(10 * LAKH, 0, 1000, 0)).toBe("targetPassed");
  });
});

describe("goalStatus", () => {
  it("splits at 100% and 80% of the target", () => {
    expect(goalStatus(1000, 1000)).toBe("onTrack");
    expect(goalStatus(999, 1000)).toBe("atRisk");
    expect(goalStatus(800, 1000)).toBe("atRisk");
    expect(goalStatus(799, 1000)).toBe("offTrack");
  });
});

describe("projectGoal", () => {
  const goal: GoalInput = {
    targetAmount: 10 * LAKH,
    targetDate: "2036-11-01",
    inflationBps: 600,
    expectedReturnBps: 1000,
    earmarked: 2 * LAKH,
    monthlyContribution: 5_000 * 100,
  };

  it("derives every figure a goal card shows", () => {
    const p = projectGoal(goal, "2026-11-01");
    expect(p).toMatchObject({
      months: 120,
      inflatedTarget: 179_084_770,
      progressBps: 1116,
      shortfall: 179_084_770 - 2 * LAKH,
    });
    if (typeof p === "string") throw new Error(p);
    expect(p.projected).toBe(projectedCorpus(2 * LAKH, 500_000, 1000, 120));
    expect(p.status).toBe(goalStatus(p.projected, p.inflatedTarget));
    expect(p.requiredMonthlySip).toBe(
      requiredMonthlySip(179_084_770, 2 * LAKH, 1000, 120),
    );
  });

  it("is on track with no SIP when the earmark is enough", () => {
    const p = projectGoal(
      { ...goal, earmarked: 10 * LAKH, monthlyContribution: 0 },
      "2026-11-01",
    );
    expect(p).toMatchObject({ requiredMonthlySip: 0, status: "onTrack" });
  });

  it("caps progress at 100% and floors a negative earmark at zero", () => {
    expect(
      projectGoal({ ...goal, earmarked: 500 * LAKH }, "2026-11-01"),
    ).toMatchObject({
      progressBps: 10_000,
      shortfall: 0,
    });
    expect(
      projectGoal({ ...goal, earmarked: -LAKH }, "2026-11-01"),
    ).toMatchObject({
      progressBps: 0,
      shortfall: 179_084_770,
    });
  });

  it("returns an error, never NaN, for a past target", () => {
    expect(
      projectGoal({ ...goal, targetDate: "2026-10-01" }, "2026-11-01"),
    ).toBe("targetPassed");
    expect(
      projectGoal({ ...goal, targetDate: "2026-11-20" }, "2026-11-01"),
    ).toBe("targetPassed");
  });
});
