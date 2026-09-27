/**
 * Authorisation (ADR-0021). Authentication says *who* is calling; this says whether they
 * may touch a household. Every household-scoped route calls `guardHousehold` first.
 * A missing household and someone else's household answer identically (404), so the API
 * is not an oracle for which household ids exist.
 */
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./db/schema";
import { householdMembers } from "./db/schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Resolves the request's session to a user id, or null when there is none. */
export type SessionUser = (headers: Headers) => Promise<string | null>;

export interface GuardDeps {
  db: Db;
  sessionUser: SessionUser;
}

export type Guarded =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const deny = (status: 400 | 401 | 404) =>
  Response.json(
    {
      error: { 400: "bad request", 401: "unauthorized", 404: "not found" }[
        status
      ],
    },
    { status },
  );

export async function guardHousehold(
  deps: GuardDeps,
  headers: Headers,
  householdId: string,
): Promise<Guarded> {
  const userId = await deps.sessionUser(headers);
  if (!userId) return { ok: false, response: deny(401) };
  // Checked before SQL: Postgres rejects a malformed uuid with an error, not "no rows".
  if (!UUID.test(householdId)) return { ok: false, response: deny(404) };
  const [member] = await deps.db
    .select({ id: householdMembers.memberId })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.memberId, userId),
      ),
    )
    .limit(1);
  if (!member) return { ok: false, response: deny(404) };
  return { ok: true, userId };
}
