import { describe, expect, it } from "vitest";
import { type AssetKind, assetData, assetKinds } from "./asset";
import { FULL_BPS } from "./common";
import { type LiabilityKind, liabilityData, liabilityKinds } from "./liability";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";
const BALA = "0b000000-0000-4000-8000-0000000000b1";
const LOAN = "2a000000-0000-4000-8000-000000000001";
const FLAT = "3a000000-0000-4000-8000-000000000001";

const common = {
  owners: [
    { memberId: ASHA, shareBps: FULL_BPS / 2 },
    { memberId: BALA, shareBps: FULL_BPS / 2 },
  ],
  includeInNetWorth: true,
  tags: [],
  asOf: "2026-10-27",
  allocations: [],
  name: "Something",
  value: 5_00_000_00, // ₹5,00,000
};
const term = { startDate: "2025-04-01", maturityDate: "2030-04-01" };
const mf = { source: "amfi", code: "120503" };

/** One valid example per kind: the kind-specific fields only. */
const ASSET_SAMPLES: Record<AssetKind, object> = {
  bankAccount: { accountType: "savings", last4: "0042" },
  cash: {},
  wallet: {},
  fixedDeposit: {
    issuer: "bank",
    payout: "cumulative",
    taxSaver: false,
    autoRenew: true,
    interestBps: 710,
    ...term,
  },
  recurringDeposit: { instalment: 5_000_00, ...term },
  ppf: { startDate: "2015-04-01" },
  epf: { includesVpf: true },
  nps: { tier: 1 },
  sukanyaSamriddhi: { beneficiary: "Ananya", ...term },
  smallSavings: { scheme: "nsc", interestBps: 770, ...term },
  employerBenefit: { benefit: "gratuity" },
  mutualFund: { quantity: "1234.567", instrument: mf, plan: "direct" },
  stock: { quantity: "10", instrument: { source: "nse", code: "INFY" } },
  bond: { bondType: "sgb", interestBps: 250, maturityDate: "2031-02-01" },
  unlisted: { units: "500" },
  crypto: {
    quantity: "0.00500000",
    instrument: { source: "crypto", code: "BTC" },
  },
  usStock: { quantity: "3.5", instrument: { source: "us", code: "MSFT" } },
  rsu: {
    quantity: "40",
    instrument: { source: "us", code: "GOOG" },
    plan: "rsu",
    vestingStart: "2025-01-15",
    schedule: "quarterly",
    unvested: "120",
  },
  foreignBank: { currency: "USD", balanceMinor: 1_250_00 },
  realEstate: { address: "Flat 4B, Pune", linkedLiabilityIds: [LOAN] },
  vehicle: { registration: "MH12AB1234" },
  preciousMetal: {
    metal: "gold",
    form: "jewellery",
    weightMg: 50_000,
    karat: 22,
  },
  valuable: {},
  insurance: { policyType: "endowment", sumAssured: 10_00_000_00 },
  moneyLent: { counterparty: "Cousin Ravi", expectedBy: "2027-03-31" },
  securityDeposit: { counterparty: "Landlord" },
  reimbursement: { counterparty: "Employer" },
  chitFund: { instalment: 10_000_00, monthsPaid: 7, monthsTotal: 20 },
  p2pLending: {},
};

const LIABILITY_SAMPLES: Record<LiabilityKind, object> = {
  loan: {
    loanType: "home",
    emi: 45_000_00,
    tenureMonthsLeft: 180,
    interestBps: 850,
    linkedAssetId: FLAT,
  },
  creditCard: { last4: "9911", dueDate: "2026-11-05" },
  borrowing: { counterparty: "Mama", repayBy: "2027-01-01" },
};

const asset = (kind: string, extra: object = {}) => ({
  ...common,
  kind,
  ...(ASSET_SAMPLES as Record<string, object>)[kind],
  ...extra,
});
const liability = (kind: string, extra: object = {}) => ({
  ...common,
  kind,
  ...(LIABILITY_SAMPLES as Record<string, object>)[kind],
  ...extra,
});

describe("every kind", () => {
  it.each(assetKinds.map((k) => k.shape.kind.value))("asset %s parses", (k) => {
    const r = assetData.safeParse(asset(k));
    expect(r.error?.issues ?? []).toEqual([]);
  });

  it.each(
    liabilityKinds.map((k) => k.shape.kind.value),
  )("liability %s parses", (k) =>
    expect(liabilityData.safeParse(liability(k)).success).toBe(true));

  it.each(
    assetKinds.map((k) => k.shape.kind.value),
  )("asset %s refuses rupees with paise as a fraction, a negative value, and stray fields", (k) => {
    expect(assetData.safeParse(asset(k, { value: 100.5 })).success).toBe(false);
    expect(assetData.safeParse(asset(k, { value: -1 })).success).toBe(false);
    expect(assetData.safeParse(asset(k, { colour: "teal" })).success).toBe(
      false,
    );
  });

  it("refuses a kind that doesn't exist, and a liability kind as an asset", () => {
    expect(assetData.safeParse(asset("timeshare")).success).toBe(false);
    expect(assetData.safeParse({ ...liability("loan") }).success).toBe(false);
  });
});

describe("kind-specific rules", () => {
  it("money fields are paise too", () => {
    expect(
      assetData.safeParse(asset("recurringDeposit", { instalment: 4999.99 }))
        .success,
    ).toBe(false);
    expect(
      liabilityData.safeParse(liability("loan", { emi: 0.5 })).success,
    ).toBe(false);
  });

  it("a deposit can't mature before it starts", () => {
    for (const k of [
      "fixedDeposit",
      "recurringDeposit",
      "smallSavings",
      "sukanyaSamriddhi",
    ])
      expect(
        assetData.safeParse(
          asset(k, { startDate: "2030-01-01", maturityDate: "2029-12-31" }),
        ).success,
      ).toBe(false);
  });

  it("term insurance counts ₹0; other policies may carry a surrender value", () => {
    expect(
      assetData.safeParse(asset("insurance", { policyType: "term", value: 1 }))
        .success,
    ).toBe(false);
    expect(
      assetData.safeParse(asset("insurance", { policyType: "term", value: 0 }))
        .success,
    ).toBe(true);
  });

  it("a chit can't have more months paid than it runs", () => {
    expect(
      assetData.safeParse(
        asset("chitFund", { monthsPaid: 21, monthsTotal: 20 }),
      ).success,
    ).toBe(false);
  });

  it("quantities are decimal strings, never floats or exponents", () => {
    for (const quantity of [12.5, "1e3", "-1", "01", "1.123456789", ""])
      expect(
        assetData.safeParse(asset("mutualFund", { quantity })).success,
      ).toBe(false);
  });

  it("prices come only from the public universes", () => {
    expect(
      assetData.safeParse(
        asset("stock", { instrument: { source: "someBroker", code: "INFY" } }),
      ).success,
    ).toBe(false);
  });

  it("checks the small formats: card digits, currency, karat, NPS tier", () => {
    expect(
      assetData.safeParse(asset("bankAccount", { last4: "42" })).success,
    ).toBe(false);
    expect(
      assetData.safeParse(asset("foreignBank", { currency: "usd" })).success,
    ).toBe(false);
    expect(
      assetData.safeParse(asset("preciousMetal", { karat: 25 })).success,
    ).toBe(false);
    expect(assetData.safeParse(asset("nps", { tier: 3 })).success).toBe(false);
  });
});
