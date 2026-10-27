/**
 * Where each kind shows up (UX.md §4.1 and §3.4) and the codecs `readRecord` uses for the
 * `asset` and `liability` types. The add flow groups by mental model (seven buckets, with
 * lending and loans together); the Accounts list groups by schema category (nine sections).
 * The maps are typed against the kind unions, so adding a kind without placing it fails to compile.
 */
import { ASSET_SCHEMA_VERSION, type AssetKind, assetData } from "./asset";
import type { Registry } from "./evolution";
import {
  LIABILITY_SCHEMA_VERSION,
  type LiabilityKind,
  liabilityData,
} from "./liability";

export const BUCKETS = [
  "cashBank",
  "deposits",
  "investments",
  "retirement",
  "property",
  "insurance",
  "lendingLoans",
] as const;
export type Bucket = (typeof BUCKETS)[number];

export const SECTIONS = [
  "cashBank",
  "deposits",
  "investments",
  "retirement",
  "foreign",
  "property",
  "insurance",
  "lending",
  "loans",
] as const;
export type Section = (typeof SECTIONS)[number];

export interface Placement {
  bucket: Bucket;
  section: Section;
}

const at = (bucket: Bucket, section: Section): Placement => ({
  bucket,
  section,
});

export const ASSET_PLACEMENT: Readonly<Record<AssetKind, Placement>> = {
  bankAccount: at("cashBank", "cashBank"),
  cash: at("cashBank", "cashBank"),
  wallet: at("cashBank", "cashBank"),
  fixedDeposit: at("deposits", "deposits"),
  recurringDeposit: at("deposits", "deposits"),
  ppf: at("retirement", "retirement"),
  epf: at("retirement", "retirement"),
  nps: at("retirement", "retirement"),
  sukanyaSamriddhi: at("retirement", "retirement"),
  smallSavings: at("retirement", "retirement"),
  employerBenefit: at("retirement", "retirement"),
  mutualFund: at("investments", "investments"),
  stock: at("investments", "investments"),
  bond: at("investments", "investments"),
  unlisted: at("investments", "investments"),
  crypto: at("investments", "investments"),
  usStock: at("investments", "foreign"),
  rsu: at("investments", "foreign"),
  foreignBank: at("cashBank", "foreign"),
  realEstate: at("property", "property"),
  vehicle: at("property", "property"),
  preciousMetal: at("property", "property"),
  valuable: at("property", "property"),
  insurance: at("insurance", "insurance"),
  moneyLent: at("lendingLoans", "lending"),
  securityDeposit: at("lendingLoans", "lending"),
  reimbursement: at("lendingLoans", "lending"),
  chitFund: at("lendingLoans", "lending"),
  p2pLending: at("lendingLoans", "lending"),
};

export const LIABILITY_PLACEMENT: Readonly<Record<LiabilityKind, Placement>> = {
  loan: at("lendingLoans", "loans"),
  creditCard: at("lendingLoans", "loans"),
  borrowing: at("lendingLoans", "loans"),
};

/** Kinds valued from a price feed in M4: their manual `value` is a fallback until then. */
export const PRICED_KINDS: ReadonlySet<AssetKind> = new Set([
  "mutualFund",
  "stock",
  "crypto",
  "usStock",
  "rsu",
]);

/** The codecs for the two types this file covers; `RECORD_CODECS` (typed.ts) adds the rest. */
export const BALANCE_SHEET_CODECS = {
  asset: { current: ASSET_SCHEMA_VERSION, schema: assetData, upgrades: {} },
  liability: {
    current: LIABILITY_SCHEMA_VERSION,
    schema: liabilityData,
    upgrades: {},
  },
} satisfies Registry;
