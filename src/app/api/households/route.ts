import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { createHousehold } from "@/server/members";

export const dynamic = "force-dynamic";

/** Creates a household with the caller's own wrapped HDK (ADR-0023). */
export const POST = (request: Request) =>
  createHousehold(
    {
      db: getDb(),
      sessionUser: async (headers) =>
        (await getAuth().api.getSession({ headers }))?.user.id ?? null,
    },
    request,
  );
