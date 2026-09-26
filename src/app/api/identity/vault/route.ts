import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import type { GuardDeps } from "@/server/guard";
import { getVault, putVault } from "@/server/vault";

export const dynamic = "force-dynamic";

const deps = (): GuardDeps => ({
  db: getDb(),
  sessionUser: async (headers) =>
    (await getAuth().api.getSession({ headers }))?.user.id ?? null,
});

/** The signed-in user's identity vault (ADR-0022). */
export const GET = (request: Request) => getVault(deps(), request);
export const PUT = (request: Request) => putVault(deps(), request);
