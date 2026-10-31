import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCoinGecko } from "./crypto";
import { parseFrankfurter } from "./fx";
import { parseIbja } from "./metal";
import { marketValue } from "./price";
import { fxRate, lookup, universe } from "./universe";
import { parseSpark, SPARK_BATCH, sparkBatches } from "./us";
import { US_TICKERS } from "./us-tickers";

const AT = "2026-10-31T18:00:00.000Z";
// Excerpts of real responses (public data): spark and Frankfurter for 30 Oct 2026, CoinGecko
// on 31 Oct 2026, and the IBJA rates tables.
const read = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const spark = JSON.parse(read("yahoo-spark-2026-10-30.json")) as unknown[];
const coins = JSON.parse(
  read("coingecko-markets-2026-10-31.json"),
) as unknown[];
const fx = JSON.parse(read("frankfurter-eur-2026-10-30.json")) as unknown;
const ibja = read("ibja-rates-2026-10-30.html");

describe("US_TICKERS and sparkBatches", () => {
  it("is sorted, unique and spelled the way Yahoo spells share classes", () => {
    expect(US_TICKERS.length).toBeGreaterThan(500);
    expect([...US_TICKERS].sort()).toEqual(US_TICKERS);
    expect(new Set(US_TICKERS).size).toBe(US_TICKERS.length);
    expect(US_TICKERS).toContain("BRK-B");
    expect(US_TICKERS).not.toContain("BRK.B");
    for (const t of ["AAPL", "VOO", "QQQ", "INFY", "IBN"])
      expect(US_TICKERS).toContain(t);
  });

  it("splits into batches of at most 20, keeping every ticker", () => {
    const batches = sparkBatches(US_TICKERS);
    expect(batches.every((b) => b.length <= SPARK_BATCH)).toBe(true);
    expect(batches.flat()).toEqual(US_TICKERS);
  });
});

describe("parseSpark", () => {
  const { universe: u, skipped } = parseSpark(spark, AT);

  it("reads every priced symbol across batches, by its New York trading day", () => {
    expect(skipped).toBe(0);
    expect(universe.safeParse(u).success).toBe(true);
    expect(u).toMatchObject({
      kind: "us",
      date: "2026-10-30",
      currency: "USD",
    });
    expect(u.dates).toEqual({});
    expect(u.prices).toEqual({
      AAPL: "344.63",
      VOO: "694.81",
      "BRK-B": "542.49",
      MMM: "174.34",
      AKAM: "92.72",
      AFL: "123.89",
    });
    expect(u.names?.VOO).toBe("Vanguard S&P 500 ETF");
  });

  it("values a US holding through the FX universe", () => {
    const fxU = parseFrankfurter(fx, AT).universe;
    const q = lookup({ us: u }, { source: "us", code: "aapl" });
    const rate = fxRate({ fx: fxU }, "USD");
    expect(q).toEqual({ price: "344.63", currency: "USD", date: "2026-10-30" });
    // 2.5 × 344.63 × 94.955245255997 = 81 811.065… rupees
    expect(marketValue("2.5", q?.price ?? "", rate)).toBe(8_181_107);
  });

  it("skips non-USD and unreadable results, and repeated symbols", () => {
    const one = (symbol: string, meta: unknown) => ({
      symbol,
      response: [{ meta }],
    });
    const meta = (currency: string, price: unknown) => ({
      currency,
      regularMarketPrice: price,
      regularMarketTime: 1793390401,
      gmtoffset: -14400,
    });
    const body = {
      spark: {
        result: [
          one("SAP.DE", meta("EUR", 200)),
          one("BAD", meta("USD", -1)),
          { symbol: "NONE", response: [] },
          one("AAPL", meta("USD", 1)),
        ],
      },
    };
    const r = parseSpark([spark[0], body], AT);
    expect(r.skipped).toBe(4);
    expect(r.universe.prices.AAPL).toBe("344.63");
  });

  it("dates a stale symbol on its own day", () => {
    const body = {
      spark: {
        result: [
          {
            symbol: "OLD",
            response: [
              {
                meta: {
                  currency: "USD",
                  regularMarketPrice: 3,
                  regularMarketTime: 1793131201, // 27 Oct 2026, 16:00 New York
                  gmtoffset: -14400,
                },
              },
            ],
          },
        ],
      },
    };
    const r = parseSpark([...spark, body], AT);
    expect(r.universe.date).toBe("2026-10-30");
    expect(r.universe.dates).toEqual({ OLD: "2026-10-27" });
  });

  it("throws on an error body or when nothing is priced", () => {
    const error = { spark: { result: null, error: { code: "Bad Request" } } };
    expect(() => parseSpark([error], AT)).toThrow(RangeError);
    expect(() => parseSpark([], AT)).toThrow(RangeError);
  });
});

describe("parseCoinGecko", () => {
  const { universe: u, skipped } = parseCoinGecko([coins], AT);

  it("keys coins by symbol, expands exponent prices and dates them in IST", () => {
    expect(universe.safeParse(u).success).toBe(true);
    expect(u).toMatchObject({
      kind: "crypto",
      date: "2026-10-31",
      currency: "USD",
    });
    expect(u.prices).toEqual({
      BTC: "77614",
      ETH: "2253.81",
      USDT: "0.999524",
      BNB: "706.59",
      XRP: "1.25",
      USDC: "1",
      BTT: "0.000000353699",
      NFT: "0.000000233145",
    });
    expect(u.names?.BTC).toBe("Bitcoin");
    // The coin with a non-ASCII symbol can't be typed as a code.
    expect(skipped).toBe(1);
  });

  it("keeps the larger coin when a symbol repeats on a later page", () => {
    const clash = [
      { ...(coins[0] as object), name: "Bitcoin copy", current_price: 1 },
    ];
    const r = parseCoinGecko([coins, clash], AT);
    expect(r.universe.prices.BTC).toBe("77614");
    expect(r.skipped).toBe(2);
  });

  it("dates a coin by its IST day: 19:00 UTC is the next day", () => {
    const late = [
      { ...(coins[1] as object), last_updated: "2026-10-30T19:00:00.000Z" },
    ];
    expect(parseCoinGecko([late], AT).universe.date).toBe("2026-10-31");
  });

  it("values 0.015 BTC to the paisa", () => {
    const usd = parseFrankfurter(fx, AT).universe.prices.USD;
    // 0.015 × 77614 × 94.955245255997 = 110 547.846… rupees
    expect(marketValue("0.015", u.prices.BTC, usd)).toBe(11_054_785);
  });

  it("throws on a page that isn't a list", () => {
    expect(() => parseCoinGecko([{ error: "rate limited" }], AT)).toThrow(
      RangeError,
    );
  });
});

describe("parseFrankfurter", () => {
  const { universe: u, skipped } = parseFrankfurter(fx, AT);

  it("prices each currency in rupees per unit, from the EUR cross", () => {
    expect(skipped).toBe(0);
    expect(universe.safeParse(u).success).toBe(true);
    expect(u).toMatchObject({
      kind: "fx",
      date: "2026-10-30",
      currency: "INR",
    });
    expect(u.prices.EUR).toBe("106.084");
    expect(u.prices.USD).toBe("94.955245255997");
    expect(u.prices.GBP).toBe("127.229551451187");
    expect(u.prices.INR).toBeUndefined();
    expect(fxRate({ fx: u }, "INR")).toBe("1");
    // The 29 ECB rates swap INR for EUR itself.
    expect(Object.keys(u.prices)).toHaveLength(29);
  });

  it("throws without an INR rate or on a malformed body", () => {
    expect(() =>
      parseFrankfurter(
        { base: "EUR", date: "2026-10-30", rates: { USD: 1.1 } },
        AT,
      ),
    ).toThrow(RangeError);
    expect(() => parseFrankfurter({ message: "not found" }, AT)).toThrow(
      RangeError,
    );
  });

  it("skips a zero or malformed rate", () => {
    const r = parseFrankfurter(
      {
        base: "EUR",
        date: "2026-10-30",
        rates: { INR: 100, USD: 0, xx: 2, JPY: "1" },
      },
      AT,
    );
    expect(r.skipped).toBe(3);
    expect(r.universe.prices).toEqual({ EUR: "100" });
  });
});

describe("parseIbja", () => {
  it("takes the latest PM rates, per gram", () => {
    const { universe: u } = parseIbja(ibja, AT);
    expect(universe.safeParse(u).success).toBe(true);
    expect(u).toMatchObject({
      kind: "metal",
      date: "2026-10-30",
      currency: "INR",
      source: "IBJA PM",
      prices: { gold999: "14005.4", silver999: "181.344" },
    });
    // 10 g of 22k gold: 10 × 14005.4 × 22/24 = 128 382.83… rupees
    expect(marketValue("10", u.prices.gold999, "0.916666666667")).toBe(
      12_838_283,
    );
  });

  it("falls back to the day's AM rates before PM is out", () => {
    const amOnly = ibja.slice(0, ibja.indexOf('id="tab-pm"'));
    const { universe: u } = parseIbja(amOnly, AT);
    expect(u).toMatchObject({
      date: "2026-10-30",
      source: "IBJA AM",
      prices: { gold999: "14089.1", silver999: "183.8" },
    });
  });

  it("throws when the page no longer has the tables", () => {
    expect(() =>
      parseIbja("<html><body>maintenance</body></html>", AT),
    ).toThrow(RangeError);
  });
});
