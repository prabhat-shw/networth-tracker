/**
 * Invite-only registration (ADR-0020). An invite is the SHA-256 of a normalised email
 * address, so the server never stores the address of someone who has not signed up.
 * `scripts/invite.mjs` bootstraps the first owner with the same hash.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./db/schema";
import { invites } from "./db/schema";

export interface InviteStore {
  /** An unconsumed, unexpired invite exists for this address. */
  isInvited(email: string): Promise<boolean>;
  /** Marks the invite used; called once the account is created. */
  consume(email: string): Promise<void>;
}

export const INVITE_TTL_DAYS = 14;

export function normaliseEmail(email: string): string {
  return email.normalize("NFKC").trim().toLowerCase();
}

export async function emailHash(email: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(normaliseEmail(email));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export function pgInviteStore(
  db: PgDatabase<PgQueryResultHKT, typeof schema>,
): InviteStore {
  const open = async (email: string) =>
    and(
      eq(invites.emailHash, await emailHash(email)),
      isNull(invites.consumedAt),
      gt(invites.expiresAt, new Date()),
    );
  return {
    async isInvited(email) {
      const rows = await db
        .select({ at: invites.createdAt })
        .from(invites)
        .where(await open(email))
        .limit(1);
      return rows.length > 0;
    },
    async consume(email) {
      await db
        .update(invites)
        .set({ consumedAt: new Date() })
        .where(await open(email));
    },
  };
}
