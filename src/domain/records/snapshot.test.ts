import { describe, expect, it } from "vitest";
import type { Universe } from "../prices/universe";
import { type AssetData, assetData } from "./asset";
import { type LiabilityData, liabilityData } from "./liability";
import { buildSnapshot, istDate, snapshotData } from "./snapshot";
import { prepareWrite, typeRecords } from "./typed";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const GONE = "0f000000-0000-4000-8000-0000000000f1";
const NOW = new Date("2026-11-01T06:00:00.000Z"); // 11:30 IST

const base = (
  owners: { memberId: string; shareBps: number }[],
  value: number,
) => ({
  owners,
  includeInNetWorth: true,
  tags: [],
  asOf: "2026-10-30",
  allocations: [],
  name: "Fixture",
  value,
});
const asset = (f: object): AssetData => assetData.parse(f);

const ASSETS: AssetData[] = [
  // Joint 50/50 fund, priced: 2950.123 × ₹29.7532 = ₹87,775.60
  asset({
    ...base(
      [
        { memberId: ASHA, shareBps: 5000 },
        { memberId: BALA, shareBps: 5000 },
      ],
      1_00,
    ),
    kind: "mutualFund",
    plan: "direct",
    quantity: "2950.123",
    instrument: { source: "amfi", code: "122639" },
  }),
  asset({
    ...base([{ memberId: ASHA, shareBps: 10_000 }], 4_00_000_00),
    kind: "ppf",
  }),
  // A share still with a member who left.
  asset({
    ...base(
      [
        { memberId: BALA, shareBps: 7000 },
        { memberId: GONE, shareBps: 3000 },
      ],
      1_00_000_00,
    ),
    kind: "cash",
  }),
  {
    ...asset({
      ...base([{ memberId: ASHA, shareBps: 10_000 }], 9_99_00),
      kind: "valuable",
    }),
    includeInNetWorth: false,
  },
];
const LOANS: LiabilityData[] = [
  liabilityData.parse({
    ...base([{ memberId: BALA, shareBps: 10_000 }], 50_000_00),
    kind: "borrowing",
    counterparty: "Uncle",
  }),
];
const AMFI: Universe = {
  kind: "amfi",
  date: "2026-10-31",
  fetchedAt: "2026-11-01T00:00:00.000Z",
  source: "fixture",
  currency: "INR",
  prices: { "122639": "29.7532" },
};

describe("buildSnapshot", () => {
  const snap = buildSnapshot(ASSETS, LOANS, { amfi: AMFI }, [ASHA, BALA], NOW);

  it("values on read and totals every lens to the paisa", () => {
    expect(snap.household).toEqual({
      assets: 5_87_775_60,
      liabilities: 50_000_00,
      net: 5_37_775_60,
    });
    // ₹87,775.60 splits ₹43,887.80 each.
    expect(snap.members[ASHA]).toEqual({
      assets: 4_43_887_80,
      liabilities: 0,
      net: 4_43_887_80,
    });
    expect(snap.members[BALA]).toEqual({
      assets: 1_13_887_80,
      liabilities: 50_000_00,
      net: 63_887_80,
    });
    expect(snap.formerMembers.assets).toBe(30_000_00);
    const sum =
      snap.members[ASHA].net + snap.members[BALA].net + snap.formerMembers.net;
    expect(sum).toBe(snap.household.net);
  });

  it("composes Household assets by bucket, outside-net-worth excluded", () => {
    expect(snap.buckets).toEqual({
      investments: 87_775_60,
      retirement: 4_00_000_00,
      cashBank: 1_00_000_00,
    });
  });

  it("records the price date and is a valid, writable record", () => {
    expect(snap).toMatchObject({
      date: "2026-11-01",
      pricesAsOf: "2026-10-31",
      stale: false,
    });
    expect(snapshotData.parse(snap)).toEqual(snap);
    expect(prepareWrite("snapshot", snap).schemaVersion).toBe(1);
  });

  it("reads back as its own type", () => {
    const typed = typeRecords([
      {
        id: "5a000000-0000-8000-8000-000000000001",
        type: "snapshot",
        schemaVersion: 1,
        data: snap,
        modifiedAt: "2026-11-01T06:00:00.000Z",
        modifiedBy: ASHA,
      },
    ]);
    expect(typed.snapshot[0]?.result).toMatchObject({
      status: "ok",
      value: snap,
    });
    expect(typed.unknown).toEqual([]);
  });
});

describe("istDate", () => {
  it("rolls over at midnight IST, not UTC", () => {
    expect(istDate(new Date("2026-10-31T18:29:59.000Z"))).toBe("2026-10-31");
    expect(istDate(new Date("2026-10-31T18:30:00.000Z"))).toBe("2026-11-01");
  });
});
