/**
 * What the add flow shows (UX.md §4.1–4.2): a label per kind, the bucket it sits in, and the
 * defaults its required kind-specific fields take until #136 adds their inputs. A kind with
 * `defaults: null` needs details no default can guess (units, a counterparty), so it is listed
 * but can't be saved yet.
 */
import type { Paise } from "@/domain/money";
import type { AssetKind } from "@/domain/records/asset";
import {
  ASSET_PLACEMENT,
  BUCKETS,
  type Bucket,
  LIABILITY_PLACEMENT,
} from "@/domain/records/catalogue";
import type { LiabilityKind } from "@/domain/records/liability";

export const BUCKET_LABEL: Readonly<Record<Bucket, string>> = {
  cashBank: "Cash & Bank",
  deposits: "Deposits",
  investments: "Investments",
  retirement: "Retirement & Small Savings",
  property: "Property & Valuables",
  insurance: "Insurance",
  lendingLoans: "Lending & Loans",
};

export type KindOption =
  | {
      type: "asset";
      kind: AssetKind;
      label: string;
      bucket: Bucket;
      defaults: object | null;
    }
  | {
      type: "liability";
      kind: LiabilityKind;
      label: string;
      bucket: Bucket;
      defaults: object | null;
    };

const ASSETS: Readonly<Record<AssetKind, [string, object | null]>> = {
  bankAccount: ["Bank account", { accountType: "savings" }],
  cash: ["Cash in hand", {}],
  wallet: ["UPI / wallet balance", {}],
  foreignBank: ["Foreign bank account", null],
  fixedDeposit: [
    "Fixed deposit",
    { issuer: "bank", payout: "cumulative", taxSaver: false, autoRenew: false },
  ],
  recurringDeposit: ["Recurring deposit", null],
  mutualFund: ["Mutual fund", null],
  stock: ["Indian stocks", null],
  bond: ["Bonds / SGB", { bondType: "government" }],
  unlisted: ["Unlisted shares", {}],
  crypto: ["Crypto", null],
  usStock: ["US stocks", null],
  rsu: ["RSU / ESPP", null],
  ppf: ["PPF", {}],
  epf: ["EPF / VPF", { includesVpf: false }],
  nps: ["NPS", { tier: 1 }],
  sukanyaSamriddhi: ["Sukanya Samriddhi", null],
  smallSavings: ["NSC / KVP / SCSS", { scheme: "nsc" }],
  employerBenefit: ["Gratuity / superannuation", { benefit: "gratuity" }],
  realEstate: ["Real estate", { linkedLiabilityIds: [] }],
  vehicle: ["Vehicle", {}],
  preciousMetal: ["Gold / silver", { metal: "gold", form: "jewellery" }],
  valuable: ["Other valuable", {}],
  insurance: [
    "Life insurance policy",
    { policyType: "endowment", sumAssured: 0 },
  ],
  moneyLent: ["Money lent", null],
  securityDeposit: ["Security deposit", null],
  reimbursement: ["Reimbursement due", null],
  chitFund: ["Chit fund", null],
  p2pLending: ["P2P lending", {}],
};

const LIABILITIES: Readonly<Record<LiabilityKind, [string, object | null]>> = {
  loan: ["Loan", { loanType: "other" }],
  creditCard: ["Credit card", {}],
  borrowing: ["Borrowed from family / friends", null],
};

export const KIND_OPTIONS: readonly KindOption[] = [
  ...Object.entries(ASSETS).map(([kind, [label, defaults]]) => ({
    type: "asset" as const,
    kind: kind as AssetKind,
    label,
    bucket: ASSET_PLACEMENT[kind as AssetKind].bucket,
    defaults,
  })),
  ...Object.entries(LIABILITIES).map(([kind, [label, defaults]]) => ({
    type: "liability" as const,
    kind: kind as LiabilityKind,
    label,
    bucket: LIABILITY_PLACEMENT[kind as LiabilityKind].bucket,
    defaults,
  })),
];

export const optionsIn = (bucket: Bucket) =>
  KIND_OPTIONS.filter((o) => o.bucket === bucket);

/** Kinds whose label or bucket contains every word typed, in catalogue order. */
export function searchKinds(query: string): KindOption[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return KIND_OPTIONS.filter((o) => {
    const hay = `${o.label} ${BUCKET_LABEL[o.bucket]}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export { BUCKETS };

/**
 * "12,34,567.89" → paise, by string arithmetic so no float touches the amount. Commas and
 * spaces are ignored; anything else, or more than 2 decimals, is not an amount.
 */
export function parseRupees(input: string): Paise | null {
  const m = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(input.replace(/[,\s]/g, ""));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** "50" or "33.33" → basis points; at most 2 decimals, 0–100. */
export function parsePercent(input: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bps <= 10_000 ? bps : null;
}

/** Display only: an integer over 100 prints as its exact shortest decimal. */
export const bpsToPercent = (bps: number) => String(bps / 100);

/** Today as `YYYY-MM-DD` in the device's local zone (IST for this app's users). */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
