import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { US_TICKERS } from "@/domain/prices/us-tickers";
import {
  FEED_URLS,
  fetchBse,
  fetchCrypto,
  fetchFx,
  fetchMetal,
  fetchUniverse,
  fetchUs,
} from "./price-feeds";
import { firstZipEntry } from "./unzip";

const path = (name: string) =>
  new URL(`../domain/prices/fixtures/${name}`, import.meta.url);
const fixture = (name: string) => readFileSync(path(name), "utf8");

/** A fake fetch that records every URL and answers from `reply`. */
function recorder(reply: (url: string) => Response) {
  const urls: string[] = [];
  const f = async (url: string) => {
    urls.push(url);
    return reply(url);
  };
  return { f, urls };
}

const sparkBody = JSON.parse(fixture("yahoo-spark-2026-10-30.json"))[0];

describe("price feeds at the network edge", () => {
  it("asks Yahoo for the fixed ticker list only, 20 at a time", async () => {
    const { f, urls } = recorder(() => Response.json(sparkBody));
    const { universe } = await fetchUs(f);
    expect(urls).toHaveLength(Math.ceil(US_TICKERS.length / 20));
    const asked = urls.flatMap((u) =>
      (new URL(u).searchParams.get("symbols") ?? "").split(","),
    );
    expect(asked).toEqual(US_TICKERS);
    expect(universe.prices.AAPL).toBe("344.63");
  });

  it("fetches two fixed CoinGecko pages, Frankfurter and IBJA", async () => {
    const coins = fixture("coingecko-markets-2026-10-31.json");
    const c = recorder(() => new Response(coins));
    expect((await fetchCrypto(c.f)).universe.prices.BTC).toBe("77614");
    expect(c.urls).toEqual([FEED_URLS.crypto(1), FEED_URLS.crypto(2)]);

    const x = recorder(
      () => new Response(fixture("frankfurter-eur-2026-10-30.json")),
    );
    expect((await fetchFx(x.f)).universe.prices.USD).toBe("94.955245255997");
    expect(x.urls).toEqual([FEED_URLS.fx]);

    const m = recorder(
      () => new Response(fixture("ibja-rates-2026-10-30.html")),
    );
    expect((await fetchMetal(m.f)).universe.prices.gold999).toBe("14005.4");
    expect(m.urls).toEqual([FEED_URLS.metal]);
  });

  it("fails the whole universe on an HTTP error, so the last good file keeps serving", async () => {
    const { f } = recorder(() => new Response("", { status: 429 }));
    await expect(fetchCrypto(f)).rejects.toThrow(
      "api.coingecko.com answered 429",
    );
  });
});

describe("Indian feeds at the network edge", () => {
  const zip = new Uint8Array(
    readFileSync(path("nse-bhavcopy-2026-10-30.csv.zip")),
  );

  it("unzips NSE's bhavcopy for the asked trading day", async () => {
    const { f, urls } = recorder(() => new Response(zip));
    const { universe } = await fetchUniverse("nse", "2026-10-30", f);
    expect(urls).toEqual([
      "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_20261030_F_0000.csv.zip",
    ]);
    expect(universe).toMatchObject({ kind: "nse", date: "2026-10-30" });
  });

  it("sends BSE a Referer and AMFI a fixed URL", async () => {
    let referer: string | null = null;
    const bse = async (url: string, init?: RequestInit) => {
      referer = new Headers(init?.headers).get("referer");
      expect(url).toBe(FEED_URLS.bse("2026-10-30"));
      return new Response(fixture("bse-bhavcopy-2026-10-30.csv"));
    };
    expect((await fetchBse("2026-10-30", bse)).universe.kind).toBe("bse");
    expect(referer).toBe("https://www.bseindia.com/");

    const a = recorder(
      () => new Response(fixture("amfi-navall-2026-10-30.txt")),
    );
    expect((await fetchUniverse("amfi", "2026-10-30", a.f)).universe.kind).toBe(
      "amfi",
    );
    expect(a.urls).toEqual([FEED_URLS.amfi]);
  });

  it("reads the first zip entry and refuses anything else", () => {
    const csv = fixture("nse-bhavcopy-2026-10-30.csv");
    expect(new TextDecoder().decode(firstZipEntry(zip))).toBe(csv);
    expect(() => firstZipEntry(new TextEncoder().encode(csv))).toThrow(
      RangeError,
    );
    expect(() => firstZipEntry(zip.subarray(0, zip.length - 30))).toThrow(
      RangeError,
    );
  });
});
