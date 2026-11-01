import { describe, expect, it } from "vitest";
import { searchUniverse } from "./search";
import type { Universe, Universes } from "./universe";

const file = (
  kind: Universe["kind"],
  currency: string,
  prices: Record<string, string>,
  names?: Record<string, string>,
): Universe => ({
  kind,
  date: "2026-10-31",
  fetchedAt: "2026-11-01T02:00:00.000Z",
  source: "fixture",
  currency,
  prices,
  names,
});

const U: Universes = {
  amfi: file(
    "amfi",
    "INR",
    { "122639": "89.12", "119551": "29.7532", "100001": "10" },
    {
      "122639": "Parag Parikh Flexi Cap Fund - Direct Plan - Growth",
      "119551": "Axis Bluechip Fund - Direct Plan - Growth",
      "100001": "Old Fund",
    },
  ),
  nse: file("nse", "INR", { INFY: "1500.05", INFRATEL: "300" }),
  bse: file("bse", "INR", { INFY: "1499.9" }),
};

describe("searchUniverse", () => {
  it("finds a fund by words of its name, in any case and order", () => {
    expect(searchUniverse(U, ["amfi"], "flexi parag")).toEqual([
      {
        source: "amfi",
        code: "122639",
        name: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth",
        price: "89.12",
        currency: "INR",
      },
    ]);
  });

  it("ranks an exact code before codes that start with it", () => {
    const codes = searchUniverse(U, ["nse"], "infy").map((m) => m.code);
    expect(codes).toEqual(["INFY"]);
    expect(searchUniverse(U, ["nse"], "INF").map((m) => m.code)).toEqual([
      "INFY",
      "INFRATEL",
    ]);
  });

  it("searches only the given sources, and each separately", () => {
    expect(
      searchUniverse(U, ["nse", "bse"], "INFY").map((m) => m.source),
    ).toEqual(["nse", "bse"]);
    expect(searchUniverse(U, ["us"], "INFY")).toEqual([]);
  });

  it("returns nothing for a blank query and caps the list", () => {
    expect(searchUniverse(U, ["amfi"], "  ")).toEqual([]);
    expect(searchUniverse(U, ["amfi"], "1", 2)).toHaveLength(2);
  });
});
