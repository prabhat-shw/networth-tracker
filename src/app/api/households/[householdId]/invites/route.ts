import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import type { GuardDeps } from "@/server/guard";
import { inviteMember, listInvites } from "@/server/members";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ householdId: string }> };

const deps = (): GuardDeps => ({
  db: getDb(),
  sessionUser: async (headers) =>
    (await getAuth().api.getSession({ headers }))?.user.id ?? null,
});

/** Household invites: list open ones, invite an email (ADR-0023). */
export const GET = async (request: Request, { params }: Ctx) =>
  listInvites(deps(), request, (await params).householdId);
export const POST = async (request: Request, { params }: Ctx) =>
  inviteMember(deps(), request, (await params).householdId);
