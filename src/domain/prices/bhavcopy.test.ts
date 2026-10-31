import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBse, parseNse } from "./bhavcopy";
import { lookup, universe } from "./universe";

const AT = "2026-10-30T18:00:00.000Z";
// Excerpts of the real files for 30 Oct 2026 (public data), LF line ends.
const read = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const nseFile = read("nse-bhavcopy-2026-10-30.csv");
const bseFile = read("bse-bhavcopy-2026-10-30.csv");
const HEADER = nseFile.split("\n")[0];

describe("parseNse on a real day's file", () => {
  const { universe: u, skipped } = parseNse(nseFile, AT);

  it("keeps equity, ETF, SME, InvIT and REIT rows", () => {
    expect(skipped).toBe(0);
    expect(universe.safeParse(u).success).toBe(true);
    expect(u).toMatchObject({
      kind: "nse",
      date: "2026-10-30",
      currency: "INR",
    });
    expect(Object.keys(u.prices).sort()).toEqual(
      [
        "3IINFOLTD",
        "AGSTRA",
        "AGUL",
        "ANANTAM",
        "BIRET",
        "GOLDBEES",
        "M&M",
        "NIFTYBEES",
        "RELIANCE",
        "SBIN",
        "SWIGGY",
      ].sort(),
    );
  });

  it("drops G-secs, gold bonds, NCDs and the block-deal window", () => {
    expect(u.prices).not.toHaveProperty("679GS2031");
    expect(u.prices).not.toHaveProperty("SGBJUN28");
    expect(u.prices).not.toHaveProperty("0SCL27");
    expect(u.prices.SWIGGY).toBe("176.60");
  });

  it("prices at the close, named and mapped by ISIN", () => {
    expect(u.prices.RELIANCE).toBe("1164.90");
    expect(u.prices.GOLDBEES).toBe("115.23");
    expect(u.names?.GOLDBEES).toBe("NIP IND ETF GOLD BEES");
    expect(u.isins?.INE002A01018).toBe("RELIANCE");
    expect(lookup({ nse: u }, { source: "nse", code: "m&m" })).toEqual({
      price: "2840.30",
      currency: "INR",
      date: "2026-10-30",
    });
  });
});

describe("parseBse on a real day's file", () => {
  const { universe: u, skipped } = parseBse(bseFile, AT);

  it("keeps equity groups, ETFs in any series and InvITs", () => {
    expect(skipped).toBe(0);
    expect(universe.safeParse(u).success).toBe(true);
    expect(u).toMatchObject({ kind: "bse", date: "2026-10-30" });
    expect(Object.keys(u.prices).sort()).toEqual(
      [
        "ANSALAPI",
        "BHAGGAS",
        "GOLDBEES",
        "IRBINVIT",
        "IVZINGOLD",
        "LIQUIDETF",
        "NIFTYBEES",
        "NIKSTECH",
        "RELIANCE",
        "SASHWAT",
        "SBIN",
      ].sort(),
    );
    expect(u.prices.NIFTYBEES).toBe("262.92");
    expect(u.prices.LIQUIDETF).toBe("1000.00");
  });

  it("drops G-secs, gold bonds and rights entitlements", () => {
    for (const s of ["92GS2030", "SGBDEC26", "SHIVAM-RE1"])
      expect(u.prices).not.toHaveProperty(s);
  });
});

describe("bhavcopy rows that don't read", () => {
  const row = (symbol: string, close: string, date = "2026-10-30") =>
    `${date},${date},CM,NSE,STK,1,INE002A01018,${symbol},EQ,,,,,X LTD,1,1,1,${close},1,1,,1,,,1,1,1,F1,1,,,,,`;

  it("skips a bad close, a bad symbol, another day and a repeat", () => {
    const text = [
      HEADER,
      row("GOOD", "10.50"),
      row("NEG", "-1"),
      row("BAD SYM", "1.00"),
      row("LATE", "1.00", "2026-10-29"),
      row("GOOD", "11.00"),
      "",
    ].join("\r\n");
    const { universe: u, skipped } = parseNse(text, AT);
    expect(u.prices).toEqual({ GOOD: "10.50" });
    expect(skipped).toBe(4);
  });

  it("finds columns by name and throws on a missing one or an empty file", () => {
    expect(() => parseNse("TradDt,ISIN\n", AT)).toThrow(RangeError);
    expect(() => parseBse(HEADER, AT)).toThrow(/no prices/);
    const cols = HEADER.split(",");
    const swapped = [cols[17], ...cols.slice(0, 17), ...cols.slice(18)];
    const r = row("GOOD", "10.50").split(",");
    const moved = [r[17], ...r.slice(0, 17), ...r.slice(18)];
    expect(
      parseNse(`${swapped.join(",")}\n${moved.join(",")}`, AT).universe.prices,
    ).toEqual({ GOOD: "10.50" });
  });
});
