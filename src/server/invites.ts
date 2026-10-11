/**
 * Invite-only registration (ADR-0020). An invite is the SHA-256 of a normalised email
 * address, so the server never stores the address of someone who has not signed up.
 * The first owner needs no invite: on a server with no users, the first sign-up claims it
 * (ADR-0046). `scripts/invite.mjs` still invites with the same hash.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./db/schema";
import { invites, serverOwner, user } from "./db/schema";

export interface InviteStore {
  /** An unconsumed, unexpired invite exists for this address. */
  isInvited(email: string): Promise<boolean>;
  /** Marks the invite used; called once the account is created. */
  consume(email: string): Promise<void>;
  /** No account exists yet and the server is unclaimed, or claimed by this address. */
  mayBootstrap(email: string): Promise<boolean>;
  /**
   * Claims a server with no users for this address, atomically: of racing first sign-ups,
   * exactly one wins. True also when this address already holds the claim (a retry).
   */
  claimOwner(email: string): Promise<boolean>;
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
  const hasUsers = async () =>
    (await db.select({ id: user.id }).from(user).limit(1)).length > 0;
  const claimed = async () =>
    (await db.select().from(serverOwner).limit(1))[0]?.emailHash ?? null;
  return {
    async isInvited(email) {
      const rows = await db
        .select({ at: invites.createdAt })
        .from(invites)
        .where(await open(email))
        .limit(1);
      return rows.length > 0;
    },
    async mayBootstrap(email) {
      if (await hasUsers()) return false;
      const claim = await claimed();
      return (
        claim === null || Buffer.from(claim).equals(await emailHash(email))
      );
    },
    async claimOwner(email) {
      if (await hasUsers()) return false;
      const hash = await emailHash(email);
      await db
        .insert(serverOwner)
        .values({ emailHash: hash })
        .onConflictDoNothing();
      const claim = await claimed();
      return claim !== null && Buffer.from(claim).equals(hash);
    },
    async consume(email) {
      await db
        .update(invites)
        .set({ consumedAt: new Date() })
        .where(await open(email));
    },
  };
}
