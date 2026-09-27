/**
 * The caller's own view of households (ADR-0025, #56, #52): which ones they belong to, and
 * which are waiting for them, and by whom. First run routes on it: no household and no
 * invite → create one silently; an open invite → wait to be added. Also the two ways an
 * invite ends without a member row: the inviter cancels, or the invitee declines (both are
 * the response to a fingerprint mismatch, ADR-0025).
 */
import { and, eq, gt, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { fromBase64url, VaultFormatError } from "@/crypto/wire";
import { householdInvites, householdMembers, user } from "./db/schema";
import { deny, type GuardDeps, guardHousehold, UUID } from "./guard";
import { readBody, userEmailHash } from "./members";

const inviter = alias(user, "inviter");
const EMAIL_HASH_BYTES = 32;

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
    .select({
      householdId: householdInvites.householdId,
      inviterName: inviter.name,
      inviterEmail: inviter.email,
    })
    .from(householdInvites)
    .innerJoin(user, sql`${userEmailHash} = ${householdInvites.emailHash}`)
    .innerJoin(inviter, eq(inviter.id, householdInvites.invitedBy))
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
    .orderBy(householdInvites.createdAt);

  return Response.json(
    {
      households: mine.map((h) => ({
        id: h.id,
        joinedAt: h.joinedAt.toISOString(),
      })),
      invited: open.length > 0,
      // The invitee knows who invited them; the name is what the waiting screen shows.
      invites: open.map((i) => ({
        householdId: i.householdId,
        invitedBy: i.inviterName.trim() || i.inviterEmail,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * `DELETE …/:id/invites` `{ emailHash }` — a member cancels an invite (e.g. the invitee's
 * code didn't match). The hash travels in the body, never the URL: a hash of an email is
 * guessable, so it is treated like the address itself.
 */
export async function cancelInvite(
  deps: GuardDeps,
  request: Request,
  householdId: string,
): Promise<Response> {
  const guard = await guardHousehold(deps, request.headers, householdId);
  if (!guard.ok) return guard.response;
  const body = await readBody(request, ["emailHash"]);
  if (body instanceof Response) return body;
  if (typeof body.emailHash !== "string") return deny(400);
  let hash: Uint8Array;
  try {
    hash = fromBase64url(body.emailHash);
  } catch (e) {
    if (e instanceof VaultFormatError) return deny(400);
    throw e;
  }
  if (hash.length !== EMAIL_HASH_BYTES) return deny(400);
  const gone = await deps.db
    .delete(householdInvites)
    .where(
      and(
        eq(householdInvites.householdId, householdId),
        eq(householdInvites.emailHash, hash),
      ),
    )
    .returning({ householdId: householdInvites.householdId });
  if (gone.length === 0) return deny(404);
  return new Response(null, { status: 204 });
}

/**
 * `DELETE …/:id/invite` — the invitee declines their own invite to this household (e.g.
 * the inviter's code didn't match). Always `204`, so it says nothing about which
 * households exist or invited whom.
 */
export async function declineInvite(
  deps: GuardDeps,
  request: Request,
  householdId: string,
): Promise<Response> {
  const userId = await deps.sessionUser(request.headers);
  if (!userId) return deny(401);
  if (UUID.test(householdId))
    await deps.db
      .delete(householdInvites)
      .where(
        and(
          eq(householdInvites.householdId, householdId),
          sql`${householdInvites.emailHash} = (select ${userEmailHash} from ${user} where ${user.id} = ${userId})`,
        ),
      );
  return new Response(null, { status: 204 });
}
