/**
 * What the add flow shows (UX.md §4.1): a label per kind and the bucket it sits in. Each
 * kind's own fields are in `fields.ts`.
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
  | { type: "asset"; kind: AssetKind; label: string; bucket: Bucket }
  | { type: "liability"; kind: LiabilityKind; label: string; bucket: Bucket };

const ASSETS: Readonly<Record<AssetKind, string>> = {
  bankAccount: "Bank account",
  cash: "Cash in hand",
  wallet: "UPI / wallet balance",
  foreignBank: "Foreign bank account",
  fixedDeposit: "Fixed deposit",
  recurringDeposit: "Recurring deposit",
  mutualFund: "Mutual fund",
  stock: "Indian stocks",
  bond: "Bonds / SGB",
  unlisted: "Unlisted shares",
  crypto: "Crypto",
  usStock: "US stocks",
  rsu: "RSU / ESPP",
  ppf: "PPF",
  epf: "EPF / VPF",
  nps: "NPS",
  sukanyaSamriddhi: "Sukanya Samriddhi",
  smallSavings: "NSC / KVP / SCSS",
  employerBenefit: "Gratuity / superannuation",
  realEstate: "Real estate",
  vehicle: "Vehicle",
  preciousMetal: "Gold / silver",
  valuable: "Other valuable",
  insurance: "Life insurance policy",
  moneyLent: "Money lent",
  securityDeposit: "Security deposit",
  reimbursement: "Reimbursement due",
  chitFund: "Chit fund",
  p2pLending: "P2P lending",
};

const LIABILITIES: Readonly<Record<LiabilityKind, string>> = {
  loan: "Loan",
  creditCard: "Credit card",
  borrowing: "Borrowed from family / friends",
};

export const KIND_OPTIONS: readonly KindOption[] = [
  ...Object.entries(ASSETS).map(([kind, label]) => ({
    type: "asset" as const,
    kind: kind as AssetKind,
    label,
    bucket: ASSET_PLACEMENT[kind as AssetKind].bucket,
  })),
  ...Object.entries(LIABILITIES).map(([kind, label]) => ({
    type: "liability" as const,
    kind: kind as LiabilityKind,
    label,
    bucket: LIABILITY_PLACEMENT[kind as LiabilityKind].bucket,
  })),
];

/** The option for a stored record's kind (edit opens straight at its form). */
export const optionFor = (kind: string) =>
  KIND_OPTIONS.find((o) => o.kind === kind);

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
