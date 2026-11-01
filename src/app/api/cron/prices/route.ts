import { getDb } from "@/server/db/client";
import { fetchUniverse } from "@/server/price-feeds";
import { cronIngest } from "@/server/price-schedule";

export const dynamic = "force-dynamic";
/** Seven feeds in parallel; the slowest (the NSE zip) takes a few seconds. */
export const maxDuration = 300;

/** Staging's daily price ingest (ADR-0066): Vercel cron with `Bearer $CRON_SECRET`. */
export const GET = (request: Request) =>
  cronIngest(
    {
      db: getDb(),
      fetchUniverse: (kind, date) => fetchUniverse(kind, date),
      secret: process.env.CRON_SECRET,
    },
    request,
  );
