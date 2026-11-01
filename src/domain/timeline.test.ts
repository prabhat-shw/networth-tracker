import { describe, expect, it } from "vitest";
import type { SnapshotData } from "./records/snapshot";
import {
  byMember,
  dayChange,
  inRange,
  lensNet,
  rangeStart,
  timelineSeries,
} from "./timeline";

const A = "0a000000-0000-4000-8000-0000000000a1";
const B = "0a000000-0000-4000-8000-0000000000b2";
const t = (net: number) => ({ assets: Math.max(net, 0), liabilities: 0, net });

const snap = (
  date: string,
  a: number,
  b: number,
  former = 0,
): SnapshotData => ({
  date,
  household: t(a + b + former),
  members: { [A]: t(a), [B]: t(b) },
  formerMembers: t(former),
  buckets: { cashBank: a + b + former },
  stale: false,
});
const at = (data: SnapshotData, modifiedAt = "2026-01-01T00:00:00Z") => ({
  modifiedAt,
  data,
});

describe("timelineSeries", () => {
  it("sorts by date and keeps one point per date, the later stamp", () => {
    const series = timelineSeries([
      at(snap("2026-10-02", 30, 0)),
      at(snap("2026-10-01", 10, 0), "2026-10-01T01:00:00Z"),
      at(snap("2026-10-01", 20, 0), "2026-10-01T02:00:00Z"),
    ]);
    expect(series.map((p) => [p.date, p.household.net])).toEqual([
      ["2026-10-01", 20],
      ["2026-10-02", 30],
    ]);
  });

  it("lets today's live figure replace today's snapshot", () => {
    const series = timelineSeries(
      [at(snap("2026-10-01", 10, 0)), at(snap("2026-10-02", 30, 0))],
      snap("2026-10-02", 35, 0),
    );
    expect(series.map((p) => p.household.net)).toEqual([10, 35]);
  });

  it("is just the live point with no snapshots", () => {
    expect(timelineSeries([], snap("2026-10-02", 5, 0))).toHaveLength(1);
  });
});

describe("ranges", () => {
  it("steps back whole months, clamping to the month's last day", () => {
    expect(rangeStart("1M", "2026-03-31")).toBe("2026-02-28");
    expect(rangeStart("3M", "2026-01-15")).toBe("2025-10-15");
    expect(rangeStart("1Y", "2026-11-02")).toBe("2025-11-02");
  });

  it("filters points inside the range, All keeps every one", () => {
    const pts = [snap("2025-01-01", 1, 0), snap("2026-10-20", 2, 0)];
    expect(inRange(pts, "1M", "2026-11-02").map((p) => p.date)).toEqual([
      "2026-10-20",
    ]);
    expect(inRange(pts, "All", "2026-11-02")).toHaveLength(2);
  });
});

describe("lens values", () => {
  const pts = [snap("2026-10-01", 10, 5), snap("2026-10-02", 12, 4, 3)];

  it("reads a lens, zero for a member not in that snapshot", () => {
    expect(lensNet(pts[1], "household")).toBe(19);
    expect(lensNet(pts[1], B)).toBe(4);
    expect(lensNet(pts[1], "0a000000-0000-4000-8000-0000000000ff")).toBe(0);
  });

  it("gives the change from the previous point", () => {
    expect(dayChange(pts, 0, A)).toBeUndefined();
    expect(dayChange(pts, 1, A)).toBe(2);
    expect(dayChange(pts, 1, "household")).toBe(4);
  });

  it("splits Household by member, former members included, to the paisa", () => {
    const rows = byMember(pts[1]);
    expect(rows.map((r) => r.id)).toEqual([A, B, "former"]);
    expect(rows.reduce((s, r) => s + r.net, 0)).toBe(pts[1].household.net);
    expect(byMember(pts[0]).map((r) => r.id)).toEqual([A, B]);
  });
});
