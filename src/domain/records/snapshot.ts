/**
 * The `snapshot` envelope type (ADR-0064 §8, ADR-0070): one record per household per day
 * holding that day's net worth under every lens and the Household composition by bucket.
 * M5's timeline draws from these. Written once, by the first device to open the app that day.
 * Its id comes from the date (`src/crypto/snapshot-id.ts`), so devices converge on one record.
 */
import { z } from "zod";
import { allLenses, liabilityItem, type NetWorth } from "../networth";
import type { Universes } from "../prices/universe";
import { priceSummary, valuation } from "../prices/valuation";
import type { AssetData } from "./asset";
import { ASSET_PLACEMENT, BUCKETS, type Bucket } from "./catalogue";
import { isoDate, memberId, paise } from "./common";
import type { TypeCodec } from "./evolution";
import type { LiabilityData } from "./liability";

export const SNAPSHOT_SCHEMA_VERSION = 1;

const totals = z.strictObject({
  assets: paise.min(0),
  liabilities: paise.min(0),
  net: paise,
});

export const snapshotData = z.strictObject({
  /** The IST calendar day the snapshot is for. */
  date: isoDate,
  household: totals,
  /** Each current member's lens, by member id. */
  members: z.record(memberId, totals),
  /** Shares still held by members who left (ADR-0054); in Household, in no member's lens. */
  formerMembers: totals,
  /** Household assets in net worth, by bucket (UX §4.1); liabilities are `household.liabilities`. */
  buckets: z.partialRecord(z.enum(BUCKETS), paise.min(0)),
  /** The oldest market price behind the figures, and whether any was stale (ADR-0068). */
  pricesAsOf: isoDate.optional(),
  stale: z.boolean(),
});

export type SnapshotData = z.infer<typeof snapshotData>;

export const SNAPSHOT_CODEC: TypeCodec<SnapshotData> = {
  current: SNAPSHOT_SCHEMA_VERSION,
  schema: snapshotData,
  upgrades: {},
};

/** The IST calendar date at `now`: snapshots roll over at midnight in India. */
export const istDate = (now: Date) =>
  new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);

const copy = (t: NetWorth) => ({
  assets: t.assets,
  liabilities: t.liabilities,
  net: t.net,
});

/**
 * Today's snapshot from the readable records and cached prices: assets valued on read, every
 * lens from `allLenses`, so Household = Σ members + former members to the paisa.
 */
export function buildSnapshot(
  assets: readonly AssetData[],
  liabilities: readonly LiabilityData[],
  universes: Universes,
  memberIds: readonly string[],
  now: Date,
): SnapshotData {
  const valued = assets.map((a) => ({ a, v: valuation(a, universes, now) }));
  const lenses = allLenses(
    [
      ...valued.map(({ a, v }) => ({
        side: "asset" as const,
        value: v.value,
        includeInNetWorth: a.includeInNetWorth,
        owners: a.owners,
      })),
      ...liabilities.map(liabilityItem),
    ],
    memberIds,
  );
  const buckets: Partial<Record<Bucket, number>> = {};
  for (const { a, v } of valued) {
    if (!a.includeInNetWorth) continue;
    const b = ASSET_PLACEMENT[a.kind].bucket;
    buckets[b] = (buckets[b] ?? 0) + v.value;
  }
  const prices = priceSummary(valued.map(({ v }) => v));
  return {
    date: istDate(now),
    household: copy(lenses.household),
    members: Object.fromEntries(
      [...lenses.byMember].map(([id, t]) => [id, copy(t)]),
    ),
    formerMembers: copy(lenses.formerMembers),
    buckets,
    ...(prices.asOf ? { pricesAsOf: prices.asOf } : {}),
    stale: prices.stale,
  };
}
