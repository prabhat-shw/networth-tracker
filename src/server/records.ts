/**
 * Read side of the record envelope (ADR-0003, ADR-0021): a member pulls their household's
 * ciphertext by version. The server returns opaque bytes as base64url and never decodes
 * them. Push and the final `/api/sync/pull` shape arrive with the M2 sync engine.
 */
import { and, asc, eq, gt } from "drizzle-orm";
import { records } from "./db/schema";
import { deny, type GuardDeps, guardHousehold } from "./guard";

export const PAGE_SIZE = 500;

export interface RecordEnvelope {
  id: string;
  householdId: string;
  version: number;
  updatedAt: string;
  ciphertext: string;
  deleted: boolean;
}

export async function listRecords(
  deps: GuardDeps,
  request: Request,
  householdId: string,
): Promise<Response> {
  const guard = await guardHousehold(deps, request.headers, householdId);
  if (!guard.ok) return guard.response;

  const raw = new URL(request.url).searchParams.get("since") ?? "0";
  if (!/^\d{1,15}$/.test(raw)) return deny(400);
  const since = Number(raw);

  const rows = await deps.db
    .select()
    .from(records)
    .where(
      and(eq(records.householdId, householdId), gt(records.version, since)),
    )
    .orderBy(asc(records.version))
    .limit(PAGE_SIZE);
  const body: { records: RecordEnvelope[] } = {
    records: rows.map((r) => ({
      id: r.id,
      householdId: r.householdId,
      version: r.version,
      updatedAt: r.updatedAt.toISOString(),
      ciphertext: Buffer.from(r.ciphertext).toString("base64url"),
      deleted: r.deleted,
    })),
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
