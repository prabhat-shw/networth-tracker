/**
 * The price store (ADR-0064, #166): `ingest` fetches one universe, checks it against the
 * previous good file, and keeps it gzipped in `price_universes`; `serveUniverse` hands the
 * same bytes to every signed-in caller. The table holds public data only and is never joined
 * to households, so neither path can learn or leak what anyone holds.
 */
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { and, desc, eq, lt, lte } from "drizzle-orm";
import { toPriceUnits } from "@/domain/prices/price";
import {
  type FeedResult,
  UNIVERSE_KINDS,
  type Universe,
  type UniverseKind,
  universe,
} from "@/domain/prices/universe";
import { priceUniverses } from "./db/schema";
import { type Db, deny, type SessionUser } from "./guard";

export const RETENTION_DAYS = 400;

export interface IngestDeps {
  db: Db;
  fetchUniverse: (kind: UniverseKind, date: string) => Promise<FeedResult>;
}

export type IngestResult =
  | {
      kind: UniverseKind;
      status: "stored";
      date: string;
      count: number;
      skipped: number;
      /** Codes that moved more than 50% since the previous file: stored, but worth a look. */
      flagged: string[];
    }
  | {
      kind: UniverseKind;
      status: "rejected";
      date: string;
      count: number;
      previous: number;
    }
  | { kind: UniverseKind; status: "failed"; error: string };

const gunzipJson = (gz: Uint8Array) =>
  JSON.parse(gunzipSync(gz).toString("utf8")) as Universe;

/** More than a 50% move either way, compared exactly: |new − old| × 2 > old. */
function moved(prev: Universe, next: Universe): string[] {
  const out: string[] = [];
  for (const [code, price] of Object.entries(next.prices)) {
    if (!Object.hasOwn(prev.prices, code)) continue;
    const old = toPriceUnits(prev.prices[code]);
    const now = toPriceUnits(price);
    const diff = now > old ? now - old : old - now;
    if (old > BigInt(0) && diff * BigInt(2) > old) out.push(code);
  }
  return out;
}

const daysBefore = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * Fetches and stores one universe. A fetch or parse failure, or a file with under half the
 * codes of the previous one, writes nothing, so the last good file keeps serving (Q7).
 */
export async function ingest(
  deps: IngestDeps,
  kind: UniverseKind,
  date: string,
): Promise<IngestResult> {
  let feed: FeedResult;
  let u: Universe;
  try {
    feed = await deps.fetchUniverse(kind, date);
    u = universe.parse(feed.universe);
    if (u.kind !== kind) throw new RangeError(`got a ${u.kind} universe`);
  } catch (e) {
    return { kind, status: "failed", error: (e as Error).message };
  }

  const count = Object.keys(u.prices).length;
  const [prev] = await deps.db
    .select()
    .from(priceUniverses)
    .where(and(eq(priceUniverses.kind, kind), lte(priceUniverses.date, u.date)))
    .orderBy(desc(priceUniverses.date))
    .limit(1);
  if (prev && count * 2 < prev.count)
    return {
      kind,
      status: "rejected",
      date: u.date,
      count,
      previous: prev.count,
    };
  const flagged = prev ? moved(gunzipJson(prev.gzip), u) : [];

  const gzip = gzipSync(JSON.stringify(u), { level: 9 });
  const etag = `"${createHash("sha256").update(gzip).digest("base64url").slice(0, 27)}"`;
  const row = {
    gzip: new Uint8Array(gzip),
    etag,
    count,
    flagged: flagged.length,
    fetchedAt: new Date(u.fetchedAt),
  };
  await deps.db
    .insert(priceUniverses)
    .values({ kind, date: u.date, ...row })
    .onConflictDoUpdate({
      target: [priceUniverses.kind, priceUniverses.date],
      set: row,
    });
  await deps.db
    .delete(priceUniverses)
    .where(
      and(
        eq(priceUniverses.kind, kind),
        lt(priceUniverses.date, daysBefore(u.date, RETENTION_DAYS)),
      ),
    );
  return {
    kind,
    status: "stored",
    date: u.date,
    count,
    skipped: feed.skipped,
    flagged,
  };
}

export interface ServeDeps {
  db: Db;
  sessionUser: SessionUser;
  /** Today's date in IST: a file for an earlier day never changes. */
  today?: () => string;
}

const IST_MS = (5 * 60 + 30) * 60 * 1000;
export const todayIst = () =>
  new Date(Date.now() + IST_MS).toISOString().slice(0, 10);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `GET /api/prices/universe/:kind/:date`, where `date` is a trading day or `latest`. Needs a
 * session (abuse control) but never reads who it is: every caller gets the same bytes.
 */
export async function serveUniverse(
  deps: ServeDeps,
  request: Request,
  kind: string,
  date: string,
): Promise<Response> {
  if (!(await deps.sessionUser(request.headers))) return deny(401);
  if (!(UNIVERSE_KINDS as readonly string[]).includes(kind)) return deny(404);
  const latest = date === "latest";
  if (!latest && (!DATE.test(date) || Number.isNaN(Date.parse(date))))
    return deny(400);

  const [row] = await deps.db
    .select()
    .from(priceUniverses)
    .where(
      latest
        ? eq(priceUniverses.kind, kind)
        : and(eq(priceUniverses.kind, kind), eq(priceUniverses.date, date)),
    )
    .orderBy(desc(priceUniverses.date))
    .limit(1);
  if (!row) return deny(404);

  const immutable = !latest && row.date < (deps.today ?? todayIst)();
  const headers = new Headers({
    etag: row.etag,
    "cache-control": immutable
      ? "private, max-age=31536000, immutable"
      : "private, no-cache",
    vary: "Accept-Encoding",
  });
  const match = request.headers.get("if-none-match");
  if (match?.split(",").some((t) => t.trim() === row.etag))
    return new Response(null, { status: 304, headers });

  headers.set("content-type", "application/json");
  if (/\bgzip\b/.test(request.headers.get("accept-encoding") ?? "")) {
    headers.set("content-encoding", "gzip");
    return new Response(Buffer.from(row.gzip), { headers });
  }
  return new Response(gunzipSync(row.gzip), { headers });
}
