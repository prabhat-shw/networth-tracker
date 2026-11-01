/**
 * Runs once per Next.js server start. On the home server it starts the daily price ingest
 * (ADR-0066). Vercel has no long-lived process, so staging uses a cron instead (vercel.json),
 * and `next dev` stays off the public feeds unless asked.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL === "1") return;
  const flag = process.env.PRICE_INGEST;
  if (flag === "off") return;
  if (process.env.NODE_ENV !== "production" && flag !== "on") return;

  const [{ startPriceSchedule, ingestAll }, { getDb }, { fetchUniverse }] =
    await Promise.all([
      import("@/server/price-schedule"),
      import("@/server/db/client"),
      import("@/server/price-feeds"),
    ]);
  startPriceSchedule((date) =>
    ingestAll(
      { db: getDb(), fetchUniverse: (k, d) => fetchUniverse(k, d) },
      date,
    ),
  );
}
