import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import type { GuardDeps } from "@/server/guard";
import { listMyHouseholds } from "@/server/households";
import { createHousehold } from "@/server/members";

export const dynamic = "force-dynamic";

const deps = (): GuardDeps => ({
  db: getDb(),
  sessionUser: async (headers) =>
    (await getAuth().api.getSession({ headers }))?.user.id ?? null,
});

/** The caller's households and whether one has invited them (#56). */
export const GET = (request: Request) => listMyHouseholds(deps(), request);
/** Creates a household with the caller's own wrapped HDK (ADR-0023). */
export const POST = (request: Request) => createHousehold(deps(), request);
