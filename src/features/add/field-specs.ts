/**
 * The 0–3 fields each kind adds below Value (UX.md §4.2, ADR-0057). Typed against the kind
 * unions, so a new kind without its fields fails to compile.
 */
import type { AssetKind } from "@/domain/records/asset";
import type { LiabilityKind } from "@/domain/records/liability";
import type { FieldSpec, Option } from "./fields";

const sel = (key: string, label: string, options: readonly Option[]) =>
  ({ key, label, input: "select", options }) as const;
const sw = (key: string, label: string) =>
  ({ key, label, input: "switch" }) as const;
const opt = (
  key: string,
  label: string,
  input: "text" | "date" | "rupees" | "percent" | "units" | "int" | "grams",
) => ({ key, label, input, optional: true }) as const;
const req = (
  key: string,
  label: string,
  input: "text" | "date" | "rupees" | "percent" | "units" | "int" | "grams",
) => ({ key, label, input }) as const;
const instrument = (sources: readonly Option[], codeLabel: string) =>
  ({
    key: "instrument",
    label: "Listed as",
    input: "instrument",
    sources,
    codeLabel,
  }) as const;

const interest = opt("interestBps", "Interest rate %", "percent");
const maturity = opt("maturityDate", "Maturity date", "date");
const start = opt("startDate", "Start date", "date");
const units = req("quantity", "Units held", "units");
const counterparty = req("counterparty", "Who", "text");

export const KIND_FIELDS: Readonly<
  Record<AssetKind | LiabilityKind, readonly FieldSpec[]>
> = {
  bankAccount: [
    sel("accountType", "Account type", [
      ["savings", "Savings"],
      ["current", "Current"],
      ["sweepIn", "Sweep-in"],
    ]),
    opt("last4", "Last 4 digits", "text"),
  ],
  cash: [],
  wallet: [],
  foreignBank: [
    req("currency", "Currency (e.g. USD)", "text"),
    req("balanceMinor", "Balance in that currency", "rupees"),
  ],
  fixedDeposit: [
    maturity,
    interest,
    sw("autoRenew", "Auto-renews"),
    sel("issuer", "Issuer", [
      ["bank", "Bank"],
      ["corporate", "Corporate"],
      ["postOffice", "Post office"],
    ]),
    sel("payout", "Interest payout", [
      ["cumulative", "Cumulative"],
      ["monthly", "Monthly"],
      ["quarterly", "Quarterly"],
      ["yearly", "Yearly"],
    ]),
    sw("taxSaver", "Tax-saver FD"),
  ],
  recurringDeposit: [
    req("instalment", "Monthly instalment ₹", "rupees"),
    maturity,
    interest,
  ],
  mutualFund: [
    units,
    instrument([["amfi", "AMFI"]], "Scheme code"),
    sel("plan", "Plan", [
      ["direct", "Direct"],
      ["regular", "Regular"],
    ]),
    opt("folio", "Folio", "text"),
    opt("sip", "SIP ₹ per month", "rupees"),
  ],
  stock: [
    units,
    instrument(
      [
        ["nse", "NSE"],
        ["bse", "BSE"],
      ],
      "Symbol",
    ),
  ],
  bond: [
    sel("bondType", "Type", [
      ["government", "Government"],
      ["corporate", "Corporate"],
      ["sgb", "Sovereign gold bond"],
      ["tBill", "T-bill"],
      ["floatingRate", "Floating rate"],
    ]),
    maturity,
    interest,
  ],
  unlisted: [opt("units", "Shares held", "units")],
  crypto: [units, instrument([["crypto", "Crypto"]], "Coin")],
  usStock: [units, instrument([["us", "US"]], "Ticker")],
  rsu: [
    req("quantity", "Vested units", "units"),
    instrument([["us", "US"]], "Ticker"),
    req("vestingStart", "Vesting start", "date"),
    sel("schedule", "Vesting schedule", [
      ["quarterly", "Quarterly"],
      ["monthly", "Monthly"],
      ["yearly", "Yearly"],
    ]),
    req("unvested", "Unvested units (not in net worth)", "units"),
    sel("plan", "Plan", [
      ["rsu", "RSU"],
      ["espp", "ESPP"],
    ]),
  ],
  ppf: [start, maturity],
  epf: [sw("includesVpf", "Includes VPF")],
  nps: [
    sel("tier", "Tier", [
      [1, "Tier 1"],
      [2, "Tier 2"],
    ]),
  ],
  sukanyaSamriddhi: [
    req("beneficiary", "Daughter's name", "text"),
    start,
    maturity,
  ],
  smallSavings: [
    sel("scheme", "Scheme", [
      ["nsc", "NSC"],
      ["kvp", "KVP"],
      ["scss", "SCSS"],
    ]),
    maturity,
    interest,
  ],
  employerBenefit: [
    sel("benefit", "Benefit", [
      ["gratuity", "Gratuity"],
      ["superannuation", "Superannuation"],
    ]),
  ],
  realEstate: [opt("address", "Address", "text")],
  vehicle: [opt("registration", "Registration", "text")],
  preciousMetal: [
    sel("metal", "Metal", [
      ["gold", "Gold"],
      ["silver", "Silver"],
    ]),
    sel("form", "Form", [
      ["jewellery", "Jewellery"],
      ["coin", "Coin"],
      ["bar", "Bar"],
      ["digital", "Digital"],
    ]),
    opt("weightMg", "Weight (grams)", "grams"),
  ],
  valuable: [],
  insurance: [
    sel("policyType", "Policy type", [
      ["endowment", "Endowment"],
      ["moneyBack", "Money-back"],
      ["ulip", "ULIP"],
      ["term", "Term (counts ₹0, tracked for cover)"],
    ]),
    req("sumAssured", "Sum assured ₹", "rupees"),
    maturity,
  ],
  moneyLent: [
    { ...counterparty, label: "Borrower" },
    opt("expectedBy", "Expected back by", "date"),
    interest,
  ],
  securityDeposit: [{ ...counterparty, label: "Held by" }],
  reimbursement: [{ ...counterparty, label: "Owed by" }],
  chitFund: [
    req("instalment", "Monthly instalment ₹", "rupees"),
    req("monthsPaid", "Months paid", "int"),
    req("monthsTotal", "Total months", "int"),
  ],
  p2pLending: [],
  loan: [
    sel("loanType", "Loan type", [
      ["home", "Home"],
      ["vehicle", "Vehicle"],
      ["personal", "Personal"],
      ["education", "Education"],
      ["againstProperty", "Against property"],
      ["againstDeposit", "Against deposit"],
      ["againstGold", "Against gold"],
      ["other", "Other"],
    ]),
    opt("emi", "EMI ₹", "rupees"),
    opt("tenureMonthsLeft", "Months left", "int"),
    interest,
  ],
  creditCard: [
    opt("last4", "Last 4 digits", "text"),
    opt("dueDate", "Due date", "date"),
  ],
  borrowing: [
    { ...counterparty, label: "Lent by" },
    opt("repayBy", "Repay by", "date"),
    interest,
  ],
};

/** Required fields the form doesn't edit yet, for a new record (property ↔ loan links come later). */
export const KIND_BASE: Partial<Record<AssetKind | LiabilityKind, object>> = {
  realEstate: { linkedLiabilityIds: [] },
};
