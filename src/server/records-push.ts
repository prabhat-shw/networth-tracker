/**
 * Write side of sync (ADR-0045): a member pushes sealed envelopes with per-record optimistic
 * concurrency. A record at `version` applies only over the stored `version − 1` (no row for
 * version 1); otherwise it comes back as a conflict carrying the server's envelope. The whole
 * push is one transaction under the household row's lock, so `seq` order is commit order.
 * The server checks only the envelope's shape and padding, never its contents.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { fromBase64url } from "@/crypto/wire";
import { households, records } from "./db/schema";
import { deny, type GuardDeps, guardHousehold, UUID } from "./guard";
import { readBody } from "./members";
import { type RecordEnvelope, toEnvelope } from "./records";
import { requireRecoveryMethod } from "./vault";

export const MAX_PUSH_RECORDS = 100;
export const MAX_PUSH_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_ENVELOPE_BYTES = 64 * 1024;
export const PAD_BLOCK = 256;
/** Envelope bytes around the kid and padded plaintext: format + kidLen + iv + tag. */
const ENVELOPE_OVERHEAD = 1 + 1 + 12 + 16;
const RECORD_KEYS = "ciphertext,deleted,id,version";

interface Push {
  id: string;
  version: number;
  ciphertext: Uint8Array;
  deleted: boolean;
}

export interface Applied {
  id: string;
  version: number;
  seq: number;
  updatedAt: string;
}

/** ADR-0013 envelope v1 whose plaintext was padded to whole 256-byte blocks (ADR-0045). */
export function isPaddedEnvelope(bytes: Uint8Array): boolean {
  if (bytes.length < 2 || bytes.length > MAX_ENVELOPE_BYTES) return false;
  if (bytes[0] !== 0x01) return false;
  const body = bytes.length - ENVELOPE_OVERHEAD - bytes[1];
  return body > 0 && body % PAD_BLOCK === 0;
}

function parseRecord(x: unknown): Push | null {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
  if (Object.keys(x).sort().join() !== RECORD_KEYS) return null;
  const { id, version, ciphertext, deleted } = x as Record<string, unknown>;
  // Lowercase only: the id is bound into the AAD, and Postgres returns uuids lowercased.
  if (typeof id !== "string" || !UUID.test(id) || id !== id.toLowerCase())
    return null;
  if (!Number.isSafeInteger(version) || (version as number) < 1) return null;
  if (typeof deleted !== "boolean" || typeof ciphertext !== "string")
    return null;
  let bytes: Uint8Array;
  try {
    bytes = fromBase64url(ciphertext);
  } catch {
    return null;
  }
  if (!isPaddedEnvelope(bytes)) return null;
  return { id, version: version as number, ciphertext: bytes, deleted };
}

/** The validated records, or null for any shape, limit or duplicate violation. */
export function parsePush(body: Record<string, unknown>): Push[] | null {
  const list = body.records;
  if (!Array.isArray(list)) return null;
  if (list.length < 1 || list.length > MAX_PUSH_RECORDS) return null;
  const out: Push[] = [];
  for (const x of list) {
    const r = parseRecord(x);
    if (!r) return null;
    out.push(r);
  }
  return new Set(out.map((r) => r.id)).size === out.length ? out : null;
}

type Outcome =
  | { status: 400; error: string }
  | { status: 200; applied: Applied[]; conflicts: RecordEnvelope[] };

export async function pushRecords(
  deps: GuardDeps,
  request: Request,
  householdId: string,
): Promise<Response> {
  const guard = await guardHousehold(deps, request.headers, householdId);
  if (!guard.ok) return guard.response;
  const refused = await requireRecoveryMethod(deps.db, guard.userId);
  if (refused) return refused;

  const body = await readBody(request, ["records"], MAX_PUSH_BODY_BYTES);
  if (body instanceof Response) return body;
  const pushed = parsePush(body);
  if (!pushed) return deny(400);

  const outcome = await deps.db.transaction(async (tx): Promise<Outcome> => {
    const [hh] = await tx
      .select({ seq: households.recordSeq })
      .from(households)
      .where(eq(households.id, householdId))
      .for("update");
    const stored = await tx
      .select()
      .from(records)
      .where(
        inArray(
          records.id,
          pushed.map((r) => r.id),
        ),
      );
    if (stored.some((r) => r.householdId !== householdId))
      return { status: 400, error: "id taken" };
    const current = new Map(stored.map((r) => [r.id, r]));
    // A base the server never had is a client bug, not a conflict: there is no envelope to return.
    if (pushed.some((r) => r.version > 1 && !current.has(r.id)))
      return { status: 400, error: "bad request" };

    let seq = hh.seq;
    const applied: Applied[] = [];
    const conflicts: RecordEnvelope[] = [];
    for (const r of pushed) {
      const cur = current.get(r.id);
      if (cur && cur.version !== r.version - 1) {
        conflicts.push(toEnvelope(cur));
        continue;
      }
      seq += 1;
      const values = {
        version: r.version,
        seq,
        ciphertext: r.ciphertext,
        deleted: r.deleted,
        updatedAt: sql`now()`,
      };
      const [row] = cur
        ? await tx
            .update(records)
            .set(values)
            .where(eq(records.id, r.id))
            .returning({ updatedAt: records.updatedAt })
        : await tx
            .insert(records)
            .values({ id: r.id, householdId, ...values })
            .returning({ updatedAt: records.updatedAt });
      applied.push({
        id: r.id,
        version: r.version,
        seq,
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    if (seq !== hh.seq)
      await tx
        .update(households)
        .set({ recordSeq: seq })
        .where(eq(households.id, householdId));
    return { status: 200, applied, conflicts };
  });

  if (outcome.status === 400)
    return Response.json({ error: outcome.error }, { status: 400 });
  return Response.json(
    { applied: outcome.applied, conflicts: outcome.conflicts },
    { headers: { "cache-control": "no-store" } },
  );
}
