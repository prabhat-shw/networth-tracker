/**
 * The `goal` envelope type (PLAN.md §1.1, ADR-0051, ADR-0053). A goal holds no money itself:
 * assets and liabilities earmark part of their value to it through their embedded
 * `allocations`. The derived maths (inflated target, required SIP, on-track) is M5.
 */
import { z } from "zod";
import { isoDate, owners, paise, rateBps, text } from "./common";
import type { TypeCodec } from "./evolution";

export const GOAL_SCHEMA_VERSION = 1;

export const GOAL_KINDS = [
  "house",
  "education",
  "retirement",
  "emergency",
  "vehicle",
  "wedding",
  "travel",
  "custom",
] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

/** PLAN.md §1.1 defaults, applied by the form; the record always stores the rate used. */
export const DEFAULT_INFLATION_BPS: Readonly<Record<GoalKind, number>> = {
  house: 600,
  education: 1000,
  retirement: 600,
  emergency: 600,
  vehicle: 600,
  wedding: 600,
  travel: 600,
  custom: 600,
};

export const goalData = z.strictObject({
  kind: z.enum(GOAL_KINDS),
  name: text(80),
  /** In today's rupees (paise); M5 inflates it to `targetDate`. */
  targetAmount: paise.min(1),
  targetDate: isoDate,
  inflationBps: rateBps,
  expectedReturnBps: rateBps,
  /** 1 is the most important; ties are fine. */
  priority: z.int().min(1).max(5),
  owners,
  /** One of the 8 categorical chart slots (UX.md §6.3); unset uses the accent hue. */
  colour: z.int().min(1).max(8).optional(),
  notes: z.string().max(2000).optional(),
});

export type GoalData = z.infer<typeof goalData>;

export const GOAL_CODEC: TypeCodec<GoalData> = {
  current: GOAL_SCHEMA_VERSION,
  schema: goalData,
  upgrades: {},
};
