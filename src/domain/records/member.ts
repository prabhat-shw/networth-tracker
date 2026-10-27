/**
 * The `member` envelope type (ADR-0051 Q5, ADR-0054): a member's display name and colour,
 * inside the ciphertext, since the server knows members only by id (ADR-0031). Each member
 * writes their own: a profile counts only when `memberId` is the member who last saved it,
 * so one member can't rename another. Record ids stay random, so the server can't tell a
 * profile from any other record.
 */
import { z } from "zod";
import { memberId, text } from "./common";
import type { TypeCodec } from "./evolution";

export const MEMBER_SCHEMA_VERSION = 1;

export const memberData = z.strictObject({
  memberId,
  name: text(40),
  /** One of the 8 categorical chart slots (UX.md §6.3); unset uses the accent hue. */
  colour: z.int().min(1).max(8).optional(),
});

export type MemberData = z.infer<typeof memberData>;

export const MEMBER_CODEC: TypeCodec<MemberData> = {
  current: MEMBER_SCHEMA_VERSION,
  schema: memberData,
  upgrades: {},
};

/** What an owner whose profile is gone (or never written) reads as. */
export const FORMER_MEMBER = "Former member";
