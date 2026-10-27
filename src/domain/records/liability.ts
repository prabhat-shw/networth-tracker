/**
 * The `liability` envelope type (ADR-0051, ADR-0052). `value` is what is still owed, in
 * paise and never negative: the net-worth engine (#133) subtracts it. A liability carries
 * the same common fields as an asset, so a joint home loan is split 50/50 the same way.
 */
import { z } from "zod";
import {
  commonFields,
  isoDate,
  paise,
  rateBps,
  recordId,
  text,
} from "./common";

export const LIABILITY_SCHEMA_VERSION = 1;

const liability = commonFields.extend({
  name: text(80),
  /** Outstanding today, entered by hand. */
  value: paise.min(0),
  interestBps: rateBps.optional(),
});

const kind = <K extends string, S extends z.ZodRawShape>(k: K, shape: S) =>
  liability.extend({ kind: z.literal(k), ...shape });

export const liabilityKinds = [
  kind("loan", {
    loanType: z.enum([
      "home",
      "vehicle",
      "personal",
      "education",
      "againstProperty",
      "againstDeposit",
      "againstGold",
      "other",
    ]),
    emi: paise.min(1).optional(),
    tenureMonthsLeft: z.int().min(0).max(600).optional(),
    /** The asset it is secured on or bought (the flat for a home loan), if recorded. */
    linkedAssetId: recordId.optional(),
  }),
  kind("creditCard", {
    last4: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    dueDate: isoDate.optional(),
  }),
  kind("borrowing", {
    /** Who lent it: family or friends, by name. */
    counterparty: text(80),
    repayBy: isoDate.optional(),
  }),
] as const;

export const liabilityData = z.discriminatedUnion("kind", liabilityKinds);
export type LiabilityData = z.infer<typeof liabilityData>;
export type LiabilityKind = LiabilityData["kind"];
