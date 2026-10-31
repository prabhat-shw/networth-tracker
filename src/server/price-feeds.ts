/**
 * The network edge for the US, crypto, FX and metal universes (ADR-0064, #165). Every URL is
 * fixed in this file or built from the committed `US_TICKERS` list: nothing here takes a
 * household, a user or a holding, so every request is the same for everyone (ADR-0005).
 * Parsing is pure and lives in `src/domain/prices/`. `ingest` (#166) calls these.
 */
import {
  COINGECKO_PAGES,
  COINGECKO_PER_PAGE,
  parseCoinGecko,
} from "@/domain/prices/crypto";
import { parseFrankfurter } from "@/domain/prices/fx";
import { parseIbja } from "@/domain/prices/metal";
import type { FeedResult } from "@/domain/prices/universe";
import { parseSpark, sparkBatches } from "@/domain/prices/us";
import { US_TICKERS } from "@/domain/prices/us-tickers";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Yahoo and IBJA turn away requests without a browser User-Agent. */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "application/json, text/html;q=0.9",
};

export const FEED_URLS = {
  us: (batch: readonly string[]) =>
    `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${batch.map(encodeURIComponent).join(",")}&range=1d&interval=1d`,
  crypto: (page: number) =>
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${COINGECKO_PER_PAGE}&page=${page}`,
  fx: "https://api.frankfurter.dev/v1/latest?base=EUR",
  metal: "https://ibjarates.com/",
} as const;

async function get(f: Fetch, url: string): Promise<Response> {
  const res = await f(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res;
}

const now = () => new Date().toISOString();

/** Every US ticker, 20 per request, one request at a time. */
export async function fetchUs(f: Fetch = fetch): Promise<FeedResult> {
  const bodies: unknown[] = [];
  for (const batch of sparkBatches(US_TICKERS))
    bodies.push(await (await get(f, FEED_URLS.us(batch))).json());
  return parseSpark(bodies, now());
}

/** The top coins by market cap, page by page. */
export async function fetchCrypto(f: Fetch = fetch): Promise<FeedResult> {
  const pages: unknown[] = [];
  for (let p = 1; p <= COINGECKO_PAGES; p++)
    pages.push(await (await get(f, FEED_URLS.crypto(p))).json());
  return parseCoinGecko(pages, now());
}

export async function fetchFx(f: Fetch = fetch): Promise<FeedResult> {
  return parseFrankfurter(await (await get(f, FEED_URLS.fx)).json(), now());
}

export async function fetchMetal(f: Fetch = fetch): Promise<FeedResult> {
  return parseIbja(await (await get(f, FEED_URLS.metal)).text(), now());
}
