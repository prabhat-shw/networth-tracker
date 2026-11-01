# ADR-0066 — Price ingest schedule

**Status:** Accepted · 2026-11-01 · issue #167 · builds on [ADR-0064](0064-prices-and-valuation.md) Q6, [ADR-0065](0065-price-store-and-route.md)

## Context

ADR-0064 Q6 settled two triggers for one pipeline: a timer inside the home server, and a
Vercel cron on staging. #166 built `ingest(deps, kind, date)`. These details were still open:
where the timer lives, which date each run collects, and how the cron route is guarded.

## Decision

1. **One entry point.** `ingestAll(deps, date)` in `src/server/price-schedule.ts` runs
   `ingest` for every kind in parallel. One kind failing never stops another. It logs one
   JSON line per kind: `{event:"price-ingest", kind, status, date, count, skipped, flagged}`
   (status words, counts and public instrument codes only, never a URL or secret).
2. **Run times: 23:30 and 07:00 IST.** 23:30 comes after AMFI's ~23:00 publish window. The
   07:00 retry is a **full rerun**, not a rerun of failed kinds only. `ingest` replaces a
   same-day row and a failed fetch writes nothing, so a full rerun is safe. It also picks up
   the US close (≈01:30 IST), which the evening run can't see.
3. **Run date.** `runDate(now)` is the IST date, or the day before if the run happens
   before noon IST. The morning retry then asks for the previous day's bhavcopy, the only one
   that exists yet. A Vercel cron that slips past midnight IST also gets the right day.
4. **Home server: `src/instrumentation.ts`.** Next calls `register()` once per server start.
   In the Node runtime it starts `startPriceSchedule`: one `setTimeout` (unref'd) armed for
   `nextRun(now)` and re-armed after each run, even after a crash. There is no cron
   library or extra container. It is off on Vercel (`VERCEL=1`) and when `PRICE_INGEST=off`
   (the E2E stack sets this). Under `next dev` it is also off unless `PRICE_INGEST=on`.
   A restart skips a run that was due while the server was down. The next slot catches up,
   and the route keeps serving the last good file in the meantime.
5. **Staging: `vercel.json` crons** (`0 18 * * *` and `30 1 * * *` UTC) call
   `GET /api/cron/prices`. Vercel sends `Authorization: Bearer $CRON_SECRET`. The route
   compares it in constant time, answers `401` with nothing run if it doesn't match, and
   **also when `CRON_SECRET` is unset**. The response gives a per-kind summary (`flagged` as
   a count). `maxDuration = 300`.

## Consequences

- Staging needs `CRON_SECRET` in the Vercel env (DEPLOYMENT.md S2), then a redeploy. Until
  then every cron call gets `401` and the universe route serves `404`.
- Hobby-plan crons fire somewhere within their hour. Rule 3 covers that.
- Each container restart re-arms the home timer. Two app replicas would ingest twice, which
  is harmless (an upsert). Compose runs one.
- #168's client asks `/latest`, so a missed run only makes prices a day older. #169 shows
  that as stale.
