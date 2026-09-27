import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { declineInvite } from "@/server/households";

export const dynamic = "force-dynamic";

/** The signed-in invitee declines their own invite to this household (#52). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ householdId: string }> },
) {
  return declineInvite(
    {
      db: getDb(),
      sessionUser: async (headers) =>
        (await getAuth().api.getSession({ headers }))?.user.id ?? null,
    },
    request,
    (await params).householdId,
  );
}
