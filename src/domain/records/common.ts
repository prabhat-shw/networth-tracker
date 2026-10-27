/**
 * Fields every asset and liability record carries (ADR-0051, PLAN.md §1). Shares and
 * percentages are integer basis points (10 000 = 100%) and money is integer paise, so no
 * float ever reaches a total. The schemas are strict: a field this build doesn't know means
 * the record isn't the version it claims, and parsing fails rather than silently dropping
 * data that a later save would then erase.
 */
import { z } from "zod";
import type { Paise } from "../money";

/** 100% in basis points. */
export const FULL_BPS = 10_000;

/** A member is their lowercase user id, the same id `modifiedBy` carries (ADR-0047). */
export const memberId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

/** Ids of other records (goals, linked liabilities) share the record-id format. */
export const recordId = memberId;

export const bps = z.int().min(0).max(FULL_BPS);
/** Integer paise; `z.int()` is already limited to safe integers. */
export const paise = z.int();
const shareBps = bps.min(1);
/** Trimmed, non-empty text of at most `max` characters. */
export const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * Units held (MF units, shares, crypto), as a decimal string with up to 8 places: unit
 * counts are not money, but floats would still drift (0.1 + 0.2 units). M4 multiplies them by
 * a price with integer arithmetic.
 */
export const quantity = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,14})(\.\d{1,8})?$/,
    "a number of units, up to 8 decimals",
  );

/**
 * Where M4 finds a price, chosen from public universes only (CLAUDE.md: no per-symbol
 * queries). The key is stored inside the ciphertext, never sent anywhere.
 */
export const instrument = z.strictObject({
  source: z.enum(["amfi", "nse", "bse", "us", "crypto"]),
  code: text(32),
});

/** An annual rate in basis points (7.1% = 710); up to 100%. */
export const rateBps = bps;

const sumBps = (list: readonly { shareBps: number }[]) =>
  list.reduce((total, x) => total + x.shareBps, 0);

function unique<T>(list: readonly T[], key: (x: T) => string): boolean {
  return new Set(list.map(key)).size === list.length;
}

export const owner = z.strictObject({ memberId, shareBps });

/** Who owns the thing: at least one member, each once, shares summing to exactly 100%. */
export const owners = z
  .array(owner)
  .min(1)
  .max(16)
  .refine((list) => unique(list, (o) => o.memberId), "an owner is listed twice")
  .refine((list) => sumBps(list) === FULL_BPS, "shares must add up to 100%");

/**
 * Earmarks part of a record for a goal (PLAN.md §1.1). Embedded in the record it funds, so
 * the "never more than 100%" rule is checked on every write and no merge can break it.
 * `percent` is a share of the record's current value; `fixed` is an amount in paise.
 */
export const allocation = z.discriminatedUnion("mode", [
  z.strictObject({
    goalId: recordId,
    mode: z.literal("percent"),
    bps: shareBps,
  }),
  z.strictObject({
    goalId: recordId,
    mode: z.literal("fixed"),
    amount: paise.min(1),
  }),
]);

export const allocations = z
  .array(allocation)
  .max(32)
  .refine((list) => unique(list, (a) => a.goalId), "a goal is tagged twice")
  .refine(
    (list) =>
      list.reduce((t, a) => t + (a.mode === "percent" ? a.bps : 0), 0) <=
      FULL_BPS,
    "goals can't take more than 100%",
  );

export type Allocation = z.infer<typeof allocation>;

/**
 * How much of `value` the allocations claim, in paise. Percent shares round down, so the
 * remainder (Unallocated) is never understated by rounding.
 */
export function allocatedPaise(
  list: readonly Allocation[],
  value: Paise,
): Paise {
  let total = 0;
  for (const a of list)
    total +=
      a.mode === "fixed" ? a.amount : Math.floor((value * a.bps) / FULL_BPS);
  return total;
}

/**
 * Whether the allocations fit inside the record's value. Checked at save time: fixed
 * amounts can't exceed a value the user just entered. A later drop in value (a price fall)
 * can make them overshoot; the goal maths then caps them (#134) rather than refusing the record.
 */
export function allocationsFit(
  list: readonly Allocation[],
  value: Paise,
): boolean {
  return value >= 0 && allocatedPaise(list, value) <= value;
}

/** A nominee is a household member or anyone else, named (#25). */
export const nominee = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("member"), memberId, shareBps }),
  z.strictObject({ kind: z.literal("person"), name: text(80), shareBps }),
]);

export const nominees = z
  .array(nominee)
  .min(1)
  .max(10)
  .refine(
    (list) => unique(list, (n) => (n.kind === "member" ? n.memberId : n.name)),
    "a nominee is listed twice",
  )
  .refine((list) => sumBps(list) === FULL_BPS, "shares must add up to 100%");

/** A calendar date, `YYYY-MM-DD`, read as a date in IST (ARCHITECTURE.md). */
export const isoDate = z.iso.date();

export const tags = z
  .array(text(32))
  .max(20)
  .refine((list) => unique(list, (t) => t.toLowerCase()), "a tag is repeated");

/** The shared shape; each kind (#131) extends it with its own fields. */
export const commonFields = z.strictObject({
  owners,
  includeInNetWorth: z.boolean(),
  institution: text(80).optional(),
  tags,
  notes: z.string().max(2000).optional(),
  asOf: isoDate,
  allocations,
  nominees: nominees.optional(),
});

export type CommonFields = z.infer<typeof commonFields>;
