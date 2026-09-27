/**
 * The caller's own view of households (ADR-0025, #56): which ones they belong to, and
 * whether some household is waiting for them. First run routes on it: no household and no
 * invite → create one silently; an open invite → wait to be added. No id in the path, so
 * there is nothing to guard beyond the session: a caller only ever sees their own rows.
 */
import { and, eq, gt, notExists, sql } from "drizzle-orm";
import { householdInvites, householdMembers, user } from "./db/schema";
import { deny, type GuardDeps } from "./guard";
import { userEmailHash } from "./members";

export async function listMyHouseholds(
  deps: GuardDeps,
  request: Request,
): Promise<Response> {
  const userId = await deps.sessionUser(request.headers);
  if (!userId) return deny(401);

  const mine = await deps.db
    .select({
      id: householdMembers.householdId,
      joinedAt: householdMembers.createdAt,
    })
    .from(householdMembers)
    .where(eq(householdMembers.memberId, userId))
    .orderBy(householdMembers.createdAt);

  const open = await deps.db
    .select({ householdId: householdInvites.householdId })
    .from(householdInvites)
    .innerJoin(user, sql`${userEmailHash} = ${householdInvites.emailHash}`)
    .where(
      and(
        eq(user.id, userId),
        gt(householdInvites.expiresAt, sql`now()`),
        notExists(
          deps.db
            .select({ one: sql`1` })
            .from(householdMembers)
            .where(
              and(
                eq(householdMembers.householdId, householdInvites.householdId),
                eq(householdMembers.memberId, userId),
              ),
            ),
        ),
      ),
    )
    .limit(1);

  return Response.json(
    {
      households: mine.map((h) => ({
        id: h.id,
        joinedAt: h.joinedAt.toISOString(),
      })),
      invited: open.length > 0,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
