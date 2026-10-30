import { describe, expect, it } from "vitest";
import {
  allLenses,
  assetItem,
  type BalanceItem,
  liabilityItem,
  netWorth,
  type Owner,
} from "./networth";
import { type AssetData, assetData } from "./records/asset";
import { type LiabilityData, liabilityData } from "./records/liability";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const GONE = "0f000000-0000-4000-8000-0000000000f1";
const L = 1_00_000_00; // ₹1 lakh in paise

const solo = (memberId: string): Owner[] => [{ memberId, shareBps: 10_000 }];
const split = (a: string, aBps: number, b: string): Owner[] => [
  { memberId: a, shareBps: aBps },
  { memberId: b, shareBps: 10_000 - aBps },
];
const base = (owners: Owner[], value: number, includeInNetWorth = true) => ({
  owners,
  includeInNetWorth,
  tags: [],
  asOf: "2026-10-28",
  allocations: [],
  name: "Fixture",
  value,
});
const asset = (fields: object): AssetData => assetData.parse(fields);
const liability = (fields: object): LiabilityData =>
  liabilityData.parse(fields);

/** The household from the M3 acceptance: a joint FD, a solo PPF each, a 60/40 flat and loan. */
const HOUSEHOLD: BalanceItem[] = [
  assetItem(
    asset({
      ...base(split(ASHA, 5000, BALA), 10 * L),
      kind: "fixedDeposit",
      issuer: "bank",
      payout: "cumulative",
      taxSaver: false,
      autoRenew: false,
    }),
  ),
  assetItem(asset({ ...base(solo(ASHA), 4 * L), kind: "ppf" })),
  assetItem(asset({ ...base(solo(BALA), 6 * L), kind: "ppf" })),
  assetItem(
    asset({
      ...base(split(ASHA, 6000, BALA), 80 * L),
      kind: "realEstate",
      linkedLiabilityIds: [],
    }),
  ),
  liabilityItem(
    liability({
      ...base(split(ASHA, 6000, BALA), 50 * L),
      kind: "loan",
      loanType: "home",
    }),
  ),
];

describe("netWorth", () => {
  it("counts everything in full for Household", () => {
    expect(netWorth(HOUSEHOLD, "household")).toEqual({
      assets: 100 * L,
      liabilities: 50 * L,
      net: 50 * L,
    });
  });

  it("weights joint records by share and solo records all-or-nothing", () => {
    // Asha: 5L of the FD + 4L PPF + 48L of the flat − 30L of the loan.
    expect(netWorth(HOUSEHOLD, { memberId: ASHA })).toEqual({
      assets: 57 * L,
      liabilities: 30 * L,
      net: 27 * L,
    });
    // Bala: 5L + 6L + 32L − 20L.
    expect(netWorth(HOUSEHOLD, { memberId: BALA })).toEqual({
      assets: 43 * L,
      liabilities: 20 * L,
      net: 23 * L,
    });
  });

  it("skips records outside net worth", () => {
    const hidden = assetItem(
      asset({ ...base(solo(ASHA), 9 * L, false), kind: "cash" }),
    );
    expect(netWorth([hidden], "household").net).toBe(0);
    expect(netWorth([hidden], { memberId: ASHA }).net).toBe(0);
  });

  it("goes negative when a lens owes more than it holds", () => {
    const card = liabilityItem(
      liability({ ...base(solo(BALA), 2 * L), kind: "creditCard" }),
    );
    expect(netWorth([card], { memberId: BALA }).net).toBe(-2 * L);
  });

  it("counts term cover and unvested RSUs at ₹0", () => {
    const termCover = assetItem(
      asset({
        ...base(solo(ASHA), 0),
        kind: "insurance",
        policyType: "term",
        sumAssured: 100 * 10 * L,
      }),
    );
    const rsu = assetItem(
      asset({
        ...base(solo(ASHA), 3 * L),
        kind: "rsu",
        quantity: "10",
        instrument: { source: "us", code: "ACME" },
        plan: "rsu",
        vestingStart: "2026-01-01",
        schedule: "quarterly",
        unvested: "300",
      }),
    );
    // Only the vested ₹3L counts; 300 unvested units and the ₹1 Cr cover add nothing.
    expect(netWorth([termCover, rsu], { memberId: ASHA }).assets).toBe(3 * L);
  });
});

describe("rounding", () => {
  it("splits an odd paisa deterministically and never loses it", () => {
    const item = assetItem(
      asset({ ...base(split(ASHA, 5000, BALA), 101), kind: "cash" }),
    );
    expect(netWorth([item], { memberId: ASHA }).net).toBe(51);
    expect(netWorth([item], { memberId: BALA }).net).toBe(50);
  });

  it("gives a 1/3 share the paise largest-remainder says", () => {
    const thirds: Owner[] = [
      { memberId: ASHA, shareBps: 3333 },
      { memberId: BALA, shareBps: 3334 },
      { memberId: GONE, shareBps: 3333 },
    ];
    const item = assetItem(asset({ ...base(thirds, 1_00_00), kind: "cash" }));
    expect(netWorth([item], { memberId: ASHA }).net).toBe(3333);
    expect(netWorth([item], { memberId: BALA }).net).toBe(3334);
  });
});

describe("allLenses", () => {
  it("agrees with netWorth for every lens", () => {
    const all = allLenses(HOUSEHOLD, [ASHA, BALA]);
    expect(all.household).toEqual(netWorth(HOUSEHOLD, "household"));
    expect(all.byMember.get(ASHA)).toEqual(
      netWorth(HOUSEHOLD, { memberId: ASHA }),
    );
    expect(all.byMember.get(BALA)).toEqual(
      netWorth(HOUSEHOLD, { memberId: BALA }),
    );
    expect(all.formerMembers).toEqual({ assets: 0, liabilities: 0, net: 0 });
  });

  it("keeps a former member's share in Household but in no member's lens", () => {
    const fd = assetItem(
      asset({ ...base(split(ASHA, 7000, GONE), 10 * L), kind: "cash" }),
    );
    const all = allLenses([fd], [ASHA, BALA]);
    expect(all.household.net).toBe(10 * L);
    expect(all.byMember.get(ASHA)?.net).toBe(7 * L);
    expect(all.byMember.get(BALA)?.net).toBe(0);
    expect(all.formerMembers.net).toBe(3 * L);
  });

  it("adds members and former members up to Household, to the paisa", () => {
    const odd: BalanceItem[] = [
      {
        side: "asset",
        value: 7 * L + 33,
        includeInNetWorth: true,
        owners: split(ASHA, 3333, BALA),
      },
      {
        side: "asset",
        value: 999,
        includeInNetWorth: true,
        owners: split(BALA, 1, GONE),
      },
      {
        side: "liability",
        value: 3 * L + 1,
        includeInNetWorth: true,
        owners: split(ASHA, 6667, GONE),
      },
    ];
    const all = allLenses(odd, [ASHA, BALA]);
    let net = all.formerMembers.net;
    for (const nw of all.byMember.values()) net += nw.net;
    expect(net).toBe(all.household.net);
  });
});
