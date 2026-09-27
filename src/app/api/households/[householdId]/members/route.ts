import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import type { GuardDeps } from "@/server/guard";
import { addMember, listMembers } from "@/server/members";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ householdId: string }> };

const deps = (): GuardDeps => ({
  db: getDb(),
  sessionUser: async (headers) =>
    (await getAuth().api.getSession({ headers }))?.user.id ?? null,
});

/** Own wrapped HDK and members' public keys; relay a wrap to an invitee (ADR-0023). */
export const GET = async (request: Request, { params }: Ctx) =>
  listMembers(deps(), request, (await params).householdId);
export const POST = async (request: Request, { params }: Ctx) =>
  addMember(deps(), request, (await params).householdId);
