/**
 * The `transaction` envelope type (ADR-0051, ADR-0062). One leg: money entering or leaving one
 * asset or liability record. A transfer between two of the household's own accounts is two legs
 * sharing a `transferId`, so contribution maths can tell it apart from new money (#27).
 * Ownership follows the account the leg points at; a leg carries no owners of its own.
 */
import { z } from "zod";
import { isoDate, paise, recordId, text } from "./common";
import type { TypeCodec } from "./evolution";

export const TRANSACTION_SCHEMA_VERSION = 1;

/** `in`: money enters the account (a deposit, a SIP). `out`: it leaves (a withdrawal). */
export const TRANSACTION_KINDS = ["in", "out"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const transactionData = z.strictObject({
  kind: z.enum(TRANSACTION_KINDS),
  /** The asset or liability record this leg moves money in or out of. */
  accountId: recordId,
  amount: paise.min(1),
  date: isoDate,
  /** Shared by both legs of a transfer between the household's own accounts. */
  transferId: recordId.optional(),
  description: text(120).optional(),
  notes: z.string().max(2000).optional(),
});

export type TransactionData = z.infer<typeof transactionData>;

export const TRANSACTION_CODEC: TypeCodec<TransactionData> = {
  current: TRANSACTION_SCHEMA_VERSION,
  schema: transactionData,
  upgrades: {},
};
