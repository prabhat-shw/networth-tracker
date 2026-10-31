import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { serveUniverse } from "@/server/prices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kind: string; date: string }> };

/** A whole public price universe, the same bytes for every caller (ADR-0064). */
export const GET = async (request: Request, { params }: Ctx) => {
  const { kind, date } = await params;
  return serveUniverse(
    {
      db: getDb(),
      sessionUser: async (headers) =>
        (await getAuth().api.getSession({ headers }))?.user.id ?? null,
    },
    request,
    kind,
    date,
  );
};
