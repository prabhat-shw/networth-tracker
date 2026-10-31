/**
 * CoinGecko `coins/markets` pages → the `crypto` universe (ADR-0064, #165). Pure: the server
 * asks for the top 500 coins by market cap in USD (two pages of 250, the same request for
 * every household) and hands the page bodies here, first page first.
 *
 * Coins are keyed by their upper-cased symbol (`BTC`), the code a user types. Symbols aren't
 * unique, so the first one wins: the larger market cap, since pages come in cap order. A
 * coin's date is its `last_updated` day in IST. Prices can be tiny and arrive in exponent
 * form (`3.53699e-7`); `priceFromNumber` keeps them exact.
 */
import { z } from "zod";
import { priceFromNumber } from "./price";
import { type FeedResult, settleDates } from "./universe";

/** Two pages of 250 make the top 500. */
export const COINGECKO_PAGES = 2;
export const COINGECKO_PER_PAGE = 250;

const page = z.array(z.unknown());
const coin = z.object({
  symbol: z.string(),
  name: z.string(),
  current_price: z.number(),
  last_updated: z.iso.datetime({ offset: true }),
});

const SYMBOL = /^[A-Z0-9_]{1,32}$/;
const IST_MS = (5 * 60 + 30) * 60 * 1000;

/** Parses market pages (JSON values). Throws `RangeError` on a malformed page or no prices. */
export function parseCoinGecko(
  pages: unknown[],
  fetchedAt: string,
): FeedResult {
  const prices: Record<string, string> = {};
  const names: Record<string, string> = {};
  const perCode: Record<string, string> = {};
  let skipped = 0;

  for (const raw of pages) {
    const p = page.safeParse(raw);
    if (!p.success) throw new RangeError("not a coins/markets page");
    for (const entry of p.data) {
      const c = coin.safeParse(entry);
      const symbol = c.success ? c.data.symbol.toUpperCase() : "";
      const price = c.success
        ? priceFromNumber(c.data.current_price)
        : undefined;
      if (
        !c.success ||
        !price ||
        !SYMBOL.test(symbol) ||
        Object.hasOwn(prices, symbol)
      ) {
        skipped++;
        continue;
      }
      prices[symbol] = price;
      perCode[symbol] = new Date(Date.parse(c.data.last_updated) + IST_MS)
        .toISOString()
        .slice(0, 10);
      const name = c.data.name.trim().slice(0, 200);
      if (name) names[symbol] = name;
    }
  }

  const settled = settleDates(perCode);
  if (!settled) throw new RangeError("no prices in the coins/markets pages");
  return {
    universe: {
      kind: "crypto",
      date: settled.date,
      fetchedAt,
      source: "CoinGecko coins/markets",
      currency: "USD",
      prices,
      names,
      dates: settled.dates,
    },
    skipped,
  };
}
