import { describe, expect, it } from "vitest";
import { contributions, transferIssues } from "./contributions";
import { assetItem, netWorth } from "./networth";
import type { AssetData } from "./records/asset";
import { FULL_BPS } from "./records/common";
import { type TransactionData, transactionData } from "./records/transaction";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const SAVINGS = "5a000000-0000-4000-8000-000000000001";
const FD = "5a000000-0000-4000-8000-000000000002";
const T1 = "7a000000-0000-4000-8000-000000000001";

const solo = [{ memberId: ASHA, shareBps: FULL_BPS }];
const joint = [
  { memberId: ASHA, shareBps: 5_000 },
  { memberId: BALA, shareBps: 5_000 },
];
const owners = new Map([
  [SAVINGS, solo],
  [FD, joint],
]);

const leg = (
  kind: "in" | "out",
  accountId: string,
  amount: number,
  extra: Partial<TransactionData> = {},
): TransactionData => ({
  kind,
  accountId,
  amount,
  date: "2026-10-01",
  ...extra,
});

const transfer = (amount: number, from = SAVINGS, to = FD) => [
  leg("out", from, amount, { transferId: T1 }),
  leg("in", to, amount, { transferId: T1 }),
];

const none = { added: 0, withdrawn: 0, net: 0 };

describe("transactionData", () => {
  it("accepts a transfer leg and rejects a zero amount", () => {
    expect(transactionData.safeParse(transfer(1_00)[0]).success).toBe(true);
    expect(transactionData.safeParse(leg("in", FD, 0)).success).toBe(false);
  });
});

describe("contributions", () => {
  it("counts external money in and out", () => {
    const legs = [
      leg("in", SAVINGS, 50_000_00),
      leg("out", SAVINGS, 10_000_00),
    ];
    expect(contributions(legs, owners, "household")).toEqual({
      added: 50_000_00,
      withdrawn: 10_000_00,
      net: 40_000_00,
    });
  });

  it("ignores a linked transfer in Household", () => {
    expect(contributions(transfer(1_00_000_00), owners, "household")).toEqual(
      none,
    );
  });

  it("ignores a transfer between accounts with the same owners in every lens", () => {
    const legs = transfer(1_00_000_00, SAVINGS, SAVINGS.replace(/1$/, "3"));
    const sameOwners = new Map([...owners, [SAVINGS.replace(/1$/, "3"), solo]]);
    expect(contributions(legs, sameOwners, { memberId: ASHA })).toEqual(none);
  });

  it("moves shares between members, adding up to Household exactly", () => {
    const legs = transfer(1_00_001);
    const asha = contributions(legs, owners, { memberId: ASHA });
    const bala = contributions(legs, owners, { memberId: BALA });
    expect(asha.net + bala.net).toBe(0);
    expect(bala).toEqual({ added: 50_000, withdrawn: 0, net: 50_000 });
  });

  it("counts a broken transfer nowhere", () => {
    const orphan = [leg("out", SAVINGS, 5_00, { transferId: T1 })];
    expect(contributions(orphan, owners, "household")).toEqual(none);
    expect(contributions(orphan, owners, { memberId: ASHA })).toEqual(none);
  });

  it("filters by date, dating a transfer by its out leg", () => {
    const legs = [
      leg("in", SAVINGS, 1_00, { date: "2025-12-31" }),
      leg("in", SAVINGS, 2_00, { date: "2026-01-01" }),
      ...transfer(10_00),
    ];
    const range = { from: "2026-01-01", to: "2026-12-31" };
    expect(contributions(legs, owners, "household", range).net).toBe(2_00);
    expect(contributions(legs, owners, { memberId: BALA }, range).net).toBe(
      5_00,
    );
    expect(
      contributions(legs, owners, { memberId: BALA }, { to: "2026-09-30" }),
    ).toEqual(none);
  });

  it("counts a leg on an unknown account in Household only", () => {
    const legs = [leg("in", T1, 3_00)];
    expect(contributions(legs, owners, "household").net).toBe(3_00);
    expect(contributions(legs, owners, { memberId: ASHA }).net).toBe(0);
  });
});

describe("a transfer changes neither net worth nor contributions", () => {
  const asset = (value: number, o = solo): AssetData =>
    ({
      kind: "cash",
      name: "Account",
      value,
      owners: o,
      includeInNetWorth: true,
      tags: [],
      asOf: "2026-10-01",
      allocations: [],
    }) as AssetData;

  it("holds in Household", () => {
    const before = [asset(5_00_000_00), asset(0, joint)].map(assetItem);
    const after = [asset(4_00_000_00), asset(1_00_000_00, joint)].map(
      assetItem,
    );
    expect(netWorth(after, "household")).toEqual(netWorth(before, "household"));
    expect(contributions(transfer(1_00_000_00), owners, "household")).toEqual(
      none,
    );
  });
});

describe("transferIssues", () => {
  it("flags a missing leg and a mismatched pair, not a valid one", () => {
    const T2 = T1.replace(/1$/, "2");
    const T3 = T1.replace(/1$/, "3");
    expect(
      transferIssues([
        ...transfer(1_00),
        leg("out", SAVINGS, 1_00, { transferId: T2 }),
        leg("out", SAVINGS, 1_00, { transferId: T3 }),
        leg("in", FD, 2_00, { transferId: T3 }),
      ]),
    ).toEqual([
      { transferId: T2, problem: "missing-leg" },
      { transferId: T3, problem: "mismatched" },
    ]);
  });
});
