/**
 * The `asset` envelope type (ADR-0051, ADR-0052): one strict schema per kind, joined into a
 * discriminated union on `kind`. Every kind has the common fields plus `name` and a manual
 * `value` in paise; the 0–3 kind-specific fields follow UX.md §4.2. Market-priced kinds also
 * carry `quantity` + `instrument`, which M4 values from public price universes.
 */
import { z } from "zod";
import { isQuantity, sumUnits, toUnits } from "../units";
import {
  commonFields,
  instrument,
  isoDate,
  lots,
  paise,
  quantity,
  rateBps,
  recordId,
  text,
} from "./common";

export const ASSET_SCHEMA_VERSION = 1;

const asset = commonFields.extend({
  name: text(80),
  /** What it is worth today, entered by hand (M4 replaces it for priced kinds). */
  value: paise.min(0),
});

const kind = <K extends string, S extends z.ZodRawShape>(k: K, shape: S) =>
  asset.extend({ kind: z.literal(k), ...shape });

/** Priced holdings may carry tax lots (#26); M6's statement import fills them too. */
const priced = { quantity, instrument, lots: lots.optional() };
/** Lots, when given, account for every unit held. */
const lotsMatch = (a: { quantity: string; lots?: { quantity: string }[] }) =>
  !a.lots ||
  // A malformed quantity already failed its own check; don't throw converting it.
  ![a, ...a.lots].every((x) => isQuantity(x.quantity)) ||
  sumUnits(a.lots) === toUnits(a.quantity);
const lotsAddUp = {
  message: "lots must add up to the units held",
  path: ["lots"],
};
const interest = { interestBps: rateBps.optional() };
const term = {
  startDate: isoDate.optional(),
  maturityDate: isoDate.optional(),
};
const counterparty = { counterparty: text(80) };

/** The maturity date, when both are given, can't come before the start. */
const datesInOrder = (a: { startDate?: string; maturityDate?: string }) =>
  !a.startDate || !a.maturityDate || a.startDate <= a.maturityDate;
const ordered = { message: "matures before it starts", path: ["maturityDate"] };

export const assetKinds = [
  // Cash & bank
  kind("bankAccount", {
    accountType: z.enum(["savings", "current", "sweepIn"]),
    last4: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
  }),
  kind("cash", {}),
  kind("wallet", {}),

  // Deposits
  kind("fixedDeposit", {
    issuer: z.enum(["bank", "corporate", "postOffice"]),
    payout: z.enum(["cumulative", "monthly", "quarterly", "yearly"]),
    taxSaver: z.boolean(),
    autoRenew: z.boolean(),
    ...interest,
    ...term,
  }).refine(datesInOrder, ordered),
  kind("recurringDeposit", {
    instalment: paise.min(1),
    ...interest,
    ...term,
  }).refine(datesInOrder, ordered),

  // Retirement & small savings
  kind("ppf", { ...term }).refine(datesInOrder, ordered),
  kind("epf", { includesVpf: z.boolean() }),
  kind("nps", { tier: z.union([z.literal(1), z.literal(2)]) }),
  kind("sukanyaSamriddhi", { beneficiary: text(80), ...term }).refine(
    datesInOrder,
    ordered,
  ),
  kind("smallSavings", {
    scheme: z.enum(["nsc", "kvp", "scss"]),
    ...interest,
    ...term,
  }).refine(datesInOrder, ordered),
  kind("employerBenefit", {
    benefit: z.enum(["gratuity", "superannuation"]),
  }),

  // Investments
  kind("mutualFund", {
    ...priced,
    folio: text(32).optional(),
    plan: z.enum(["direct", "regular"]),
    sip: paise.min(1).optional(),
  }).refine(lotsMatch, lotsAddUp),
  kind("stock", { ...priced }).refine(lotsMatch, lotsAddUp),
  kind("bond", {
    bondType: z.enum([
      "government",
      "corporate",
      "sgb",
      "tBill",
      "floatingRate",
    ]),
    ...interest,
    maturityDate: isoDate.optional(),
  }),
  kind("unlisted", { units: quantity.optional() }),
  kind("crypto", { ...priced }).refine(lotsMatch, lotsAddUp),

  // Foreign
  kind("usStock", { ...priced }).refine(lotsMatch, lotsAddUp),
  kind("rsu", {
    ...priced,
    plan: z.enum(["rsu", "espp"]),
    vestingStart: isoDate,
    schedule: z.enum(["monthly", "quarterly", "yearly"]),
    /** Not yet vested; outside net worth by default and shown separately (UX §4.2). */
    unvested: quantity,
  }).refine(lotsMatch, lotsAddUp),
  kind("foreignBank", {
    currency: z.string().regex(/^[A-Z]{3}$/),
    /** The balance in that currency's minor units (cents); `value` holds it in paise. */
    balanceMinor: z.int().min(0),
  }),

  // Property & valuables
  kind("realEstate", {
    address: text(200).optional(),
    linkedLiabilityIds: z.array(recordId).max(8),
  }),
  kind("vehicle", { registration: text(16).optional() }),
  kind("preciousMetal", {
    metal: z.enum(["gold", "silver"]),
    form: z.enum(["jewellery", "coin", "bar", "digital"]),
    /** Weight in milligrams: integers again, like paise. */
    weightMg: z.int().min(1).optional(),
    karat: z.int().min(1).max(24).optional(),
  }),
  kind("valuable", {}),

  // Insurance
  kind("insurance", {
    policyType: z.enum(["endowment", "moneyBack", "ulip", "term"]),
    sumAssured: paise.min(0),
    maturityDate: isoDate.optional(),
  }).refine((a) => a.policyType !== "term" || a.value === 0, {
    message: "term cover is tracked at ₹0",
    path: ["value"],
  }),

  // Lending (money owed to the household)
  kind("moneyLent", {
    ...counterparty,
    expectedBy: isoDate.optional(),
    ...interest,
  }),
  kind("securityDeposit", { ...counterparty }),
  kind("reimbursement", { ...counterparty }),
  kind("chitFund", {
    instalment: paise.min(1),
    monthsPaid: z.int().min(0),
    monthsTotal: z.int().min(1).max(600),
  }).refine((a) => a.monthsPaid <= a.monthsTotal, {
    message: "more months paid than the chit runs",
    path: ["monthsPaid"],
  }),
  kind("p2pLending", {}),
] as const;

export const assetData = z.discriminatedUnion("kind", assetKinds);
export type AssetData = z.infer<typeof assetData>;
export type AssetKind = AssetData["kind"];
