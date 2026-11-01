/**
 * The net worth timeline (UX.md §3.3, ADR-0071 §2). Pure: a series from the daily snapshots
 * (ADR-0070) plus today's live figure. One point per date; gaps are not interpolated.
 */
import type { Paise } from "./money";
import type { SnapshotData } from "./records/snapshot";

export type Range = "1M" | "3M" | "1Y" | "All";
export const RANGES: readonly Range[] = ["1M", "3M", "1Y", "All"];
const RANGE_MONTHS: Record<Exclude<Range, "All">, number> = {
  "1M": 1,
  "3M": 3,
  "1Y": 12,
};

export interface Stamped {
  modifiedAt: string;
  data: SnapshotData;
}

/**
 * One point per date, oldest first. Two snapshots for a date (an HDK rotation, ADR-0070 §5)
 * keep the later stamp. `live` (today, valued now) replaces any snapshot for its own date.
 */
export function timelineSeries(
  snapshots: readonly Stamped[],
  live?: SnapshotData,
): SnapshotData[] {
  const byDate = new Map<string, Stamped>();
  for (const s of snapshots) {
    const seen = byDate.get(s.data.date);
    if (!seen || s.modifiedAt > seen.modifiedAt) byDate.set(s.data.date, s);
  }
  const out = new Map([...byDate].map(([d, s]) => [d, s.data]));
  if (live) out.set(live.date, live);
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The first date inside `range` ending at `today` (same day of month, clamped). */
export function rangeStart(range: Range, today: string): string {
  if (range === "All") return "0000-01-01";
  const [y, m, d] = today.split("-").map(Number);
  const back = y * 12 + (m - 1) - RANGE_MONTHS[range];
  const year = Math.floor(back / 12);
  const month = (back % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, last);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function inRange(
  points: readonly SnapshotData[],
  range: Range,
  today: string,
): SnapshotData[] {
  const from = rangeStart(range, today);
  return points.filter((p) => p.date >= from);
}

/** A point's net worth in a lens: "household" or a member id (0 before they joined). */
export function lensNet(point: SnapshotData, lens: string): Paise {
  return lens === "household"
    ? point.household.net
    : (point.members[lens]?.net ?? 0);
}

/** Net change since the previous point in a lens, or undefined for the first. */
export function dayChange(
  points: readonly SnapshotData[],
  index: number,
  lens: string,
): Paise | undefined {
  if (index <= 0) return undefined;
  return lensNet(points[index], lens) - lensNet(points[index - 1], lens);
}

/**
 * Household net worth by member: each member's net, plus former members' when non-zero.
 * Adds up to `household.net` exactly (ADR-0070 §2).
 */
export function byMember(point: SnapshotData): { id: string; net: Paise }[] {
  const rows = Object.entries(point.members).map(([id, t]) => ({
    id,
    net: t.net,
  }));
  if (point.formerMembers.net !== 0)
    rows.push({ id: "former", net: point.formerMembers.net });
  return rows;
}
