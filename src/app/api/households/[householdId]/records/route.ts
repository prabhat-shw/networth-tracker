import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { listRecords } from "@/server/records";

export const dynamic = "force-dynamic";

/** A member's household records, newest versions after `?since=` (ADR-0021). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ householdId: string }> },
) {
  const { householdId } = await params;
  return listRecords(
    {
      db: getDb(),
      sessionUser: async (headers) =>
        (await getAuth().api.getSession({ headers }))?.user.id ?? null,
    },
    request,
    householdId,
  );
}
