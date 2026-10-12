import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import type { GuardDeps } from "@/server/guard";
import { listRecords } from "@/server/records";
import { pushRecords } from "@/server/records-push";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ householdId: string }> };

const deps = (): GuardDeps => ({
  db: getDb(),
  sessionUser: async (headers) =>
    (await getAuth().api.getSession({ headers }))?.user.id ?? null,
});

/** Pull a member's household records after `?since=<seq>`; push sealed envelopes (ADR-0045). */
export const GET = async (request: Request, { params }: Ctx) =>
  listRecords(deps(), request, (await params).householdId);
export const POST = async (request: Request, { params }: Ctx) =>
  pushRecords(deps(), request, (await params).householdId);
