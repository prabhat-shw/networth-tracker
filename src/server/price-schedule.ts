/**
 * Daily price ingest (ADR-0066, #167). Both environments call `ingestAll`: the home server
 * from an in-process timer (`startPriceSchedule`, wired in `src/instrumentation.ts`), staging
 * from a Vercel cron hitting `/api/cron/prices` (`cronIngest`). Every universe is public
 * data, so nothing here touches a household.
 */
import { timingSafeEqual } from "node:crypto";
import { UNIVERSE_KINDS } from "@/domain/prices/universe";
import { deny } from "./guard";
import { type IngestDeps, type IngestResult, ingest } from "./prices";

const IST_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 86_400_000;

/** Run times in IST minutes after midnight: after the AMFI publish window, then a retry. */
export const RUN_TIMES_IST = [23 * 60 + 30, 7 * 60] as const;

/**
 * The trading day a run at `now` collects: the IST date, or the day before for a run before
 * noon IST (the morning retry, or a late cron that slipped past midnight).
 */
export function runDate(now: Date): string {
  const ist = new Date(now.getTime() + IST_MS);
  const back = ist.getUTCHours() < 12 ? DAY_MS : 0;
  return new Date(ist.getTime() - back).toISOString().slice(0, 10);
}

/** The first run time strictly after `now`. */
export function nextRun(now: Date): Date {
  const ist = now.getTime() + IST_MS;
  const midnight = ist - (ist % DAY_MS);
  const candidates = [0, 1].flatMap((d) =>
    RUN_TIMES_IST.map((m) => midnight + d * DAY_MS + m * 60_000 - IST_MS),
  );
  return new Date(Math.min(...candidates.filter((t) => t > now.getTime())));
}

/** One log line per kind: status words, counts and public codes only. */
export function logLine(r: IngestResult): string {
  return JSON.stringify({ event: "price-ingest", ...r });
}

/** Ingests every universe for `date`, in parallel; one kind failing never stops another. */
export async function ingestAll(
  deps: IngestDeps,
  date: string,
  log: (line: string) => void = console.info,
): Promise<IngestResult[]> {
  const results = await Promise.all(
    UNIVERSE_KINDS.map((kind) => ingest(deps, kind, date)),
  );
  for (const r of results) log(logLine(r));
  return results;
}

export interface Timer {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const nodeTimer: Timer = {
  set: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref();
    return t;
  },
  clear: (t) => clearTimeout(t as NodeJS.Timeout),
};

/**
 * Runs `run(runDate)` at every `RUN_TIMES_IST`, forever. A run that throws is logged and the
 * next one is still scheduled. Returns a stop function.
 */
export function startPriceSchedule(
  run: (date: string) => Promise<unknown>,
  opts: { now?: () => Date; timer?: Timer; log?: (line: string) => void } = {},
): () => void {
  const now = opts.now ?? (() => new Date());
  const timer = opts.timer ?? nodeTimer;
  const log = opts.log ?? console.error;
  let handle: unknown;
  let stopped = false;
  const arm = () => {
    if (stopped) return;
    const at = nextRun(now());
    handle = timer.set(fire, Math.max(0, at.getTime() - now().getTime()));
  };
  const fire = () => {
    run(runDate(now()))
      .catch((e) =>
        log(
          JSON.stringify({
            event: "price-ingest",
            status: "crashed",
            error: (e as Error).message,
          }),
        ),
      )
      .finally(arm);
  };
  arm();
  return () => {
    stopped = true;
    timer.clear(handle);
  };
}

/** Equal-time compare of `Authorization: Bearer <secret>`; no secret configured → never. */
export function cronAuthorized(
  request: Request,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** `GET /api/cron/prices` (staging): the Vercel cron's entry into `ingestAll`. */
export async function cronIngest(
  deps: IngestDeps & { secret: string | undefined; now?: () => Date },
  request: Request,
): Promise<Response> {
  if (!cronAuthorized(request, deps.secret)) return deny(401);
  const date = runDate((deps.now ?? (() => new Date()))());
  const results = await ingestAll(deps, date);
  return Response.json(
    {
      date,
      results: results.map((r) =>
        r.status === "stored" ? { ...r, flagged: r.flagged.length } : r,
      ),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
