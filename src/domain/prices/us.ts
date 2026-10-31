/**
 * Yahoo `v7/finance/spark` responses → the `us` universe (ADR-0064, #165). Pure: the server
 * asks for the fixed `US_TICKERS` list in batches of 20 (Yahoo's limit) and hands every
 * response body here, in any order. `v7/finance/quote` answers 401 since 2026.
 *
 * Each result's `meta` carries the last regular-session price (`regularMarketPrice`), its time
 * and the exchange's UTC offset, so a code's date is its own trading day in New York. A
 * symbol Yahoo doesn't know is simply missing from the response. A result that doesn't read,
 * or isn't priced in USD, is skipped and counted.
 */
import { z } from "zod";
import { priceFromNumber } from "./price";
import { type FeedResult, settleDates } from "./universe";

/** Yahoo refuses more than 20 symbols per spark request. */
export const SPARK_BATCH = 20;

/** Splits the ticker list into spark-sized batches. */
export function sparkBatches(tickers: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < tickers.length; i += SPARK_BATCH)
    out.push(tickers.slice(i, i + SPARK_BATCH));
  return out;
}

const body = z.object({
  spark: z.object({
    result: z.array(z.object({ symbol: z.string(), response: z.unknown() })),
  }),
});

const meta = z.object({
  currency: z.literal("USD"),
  regularMarketPrice: z.number(),
  regularMarketTime: z.number().int().positive(),
  gmtoffset: z.number().int(),
  longName: z.string().optional(),
  shortName: z.string().optional(),
});
const response = z.array(z.object({ meta })).min(1);

const SYMBOL = /^[A-Z0-9.^=-]{1,32}$/;

/** Parses spark bodies (JSON values). Throws `RangeError` on a malformed body or no prices. */
export function parseSpark(bodies: unknown[], fetchedAt: string): FeedResult {
  const prices: Record<string, string> = {};
  const names: Record<string, string> = {};
  const perCode: Record<string, string> = {};
  let skipped = 0;

  for (const raw of bodies) {
    const parsed = body.safeParse(raw);
    if (!parsed.success) throw new RangeError("not a spark response");
    for (const r of parsed.data.spark.result) {
      const symbol = r.symbol.toUpperCase();
      const m = response.safeParse(r.response);
      const price = m.success
        ? priceFromNumber(m.data[0].meta.regularMarketPrice)
        : undefined;
      if (
        !m.success ||
        !price ||
        !SYMBOL.test(symbol) ||
        Object.hasOwn(prices, symbol)
      ) {
        skipped++;
        continue;
      }
      const {
        regularMarketTime: t,
        gmtoffset,
        longName,
        shortName,
      } = m.data[0].meta;
      prices[symbol] = price;
      perCode[symbol] = new Date((t + gmtoffset) * 1000)
        .toISOString()
        .slice(0, 10);
      const name = (longName ?? shortName ?? "").trim().slice(0, 200);
      if (name) names[symbol] = name;
    }
  }

  const settled = settleDates(perCode);
  if (!settled) throw new RangeError("no prices in the spark responses");
  return {
    universe: {
      kind: "us",
      date: settled.date,
      fetchedAt,
      source: "Yahoo spark",
      currency: "USD",
      prices,
      names,
      dates: settled.dates,
    },
    skipped,
  };
}
