import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAmfi } from "./amfi";
import { lookup, universe } from "./universe";

const AT = "2026-10-30T18:00:00.000Z";
// An excerpt of the real file for 30 Oct 2026 (public data), LF line ends.
const fixture = readFileSync(
  new URL("./fixtures/amfi-navall-2026-10-30.txt", import.meta.url),
  "utf8",
);

describe("parseAmfi on a real day's file", () => {
  const { universe: u, skipped } = parseAmfi(fixture, AT);

  it("reads every scheme line and passes over headings", () => {
    expect(skipped).toBe(0);
    expect(Object.keys(u.prices)).toHaveLength(18);
    expect(universe.safeParse(u).success).toBe(true);
    expect(u).toMatchObject({
      kind: "amfi",
      date: "2026-10-30",
      currency: "INR",
    });
  });

  it("keeps NAVs as written, including zero and 8 decimals", () => {
    expect(u.prices["135764"]).toBe("29.7532");
    expect(u.prices["108844"]).toBe("14.86269632");
    expect(u.prices["148304"]).toBe("0.0000");
  });

  it("names a scheme with its plan and option, when it has them", () => {
    expect(u.names?.["135764"]).toBe(
      "Axis Children's Fund · Direct Plan · Growth Option",
    );
    expect(u.names?.["108844"]).toBe("BANDHAN Arbitrage Fund");
  });

  it("maps both ISINs to the scheme and ignores '-'", () => {
    expect(u.isins?.INF846K01WS2).toBe("135763");
    expect(u.isins?.INF846K01WQ6).toBe("135763");
    expect(u.isins).not.toHaveProperty("-");
  });

  it("keeps a scheme's own date when it differs from the file's", () => {
    expect(u.dates).toMatchObject({
      "140196": "2026-10-31",
      "106290": "2017-09-26",
    });
    expect(u.dates).not.toHaveProperty("135764");
    expect(lookup({ amfi: u }, { source: "amfi", code: "106290" })?.date).toBe(
      "2017-09-26",
    );
    expect(lookup({ amfi: u }, { source: "amfi", code: "135764" })?.date).toBe(
      "2026-10-30",
    );
  });
});

describe("parseAmfi on damaged input", () => {
  it("skips bad lines, reads the rest, and copes with CRLF", () => {
    const text = [
      "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date",
      "Some Mutual Fund",
      "1001;INF000A01AA1;-;Good Fund;Direct Plan;Growth;12.5;30-Oct-2026",
      "1002;-;-;No NAV Fund;;;N.A.;30-Oct-2026",
      "1003;-;-;Bad Date Fund;;;10;2026-10-30",
      "ABC;-;-;Bad Code Fund;;;10;30-Oct-2026",
      "1004;-;-;Odd Month Fund;;;10;30-Foo-2026",
      "1005;too;few;fields",
      "",
    ].join("\r\n");
    const { universe: u, skipped } = parseAmfi(text, AT);
    expect(skipped).toBe(4);
    expect(u.prices).toEqual({ "1001": "12.5" });
    expect(u.isins).toEqual({ INF000A01AA1: "1001" });
  });

  it("throws when nothing reads", () => {
    expect(() => parseAmfi("<html>maintenance</html>", AT)).toThrow(RangeError);
  });
});
