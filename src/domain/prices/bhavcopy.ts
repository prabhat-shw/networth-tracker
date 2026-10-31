/**
 * NSE and BSE daily bhavcopies → the `nse` and `bse` universes (ADR-0064, #164). Pure: the
 * server fetches the whole public file and hands the text here.
 *
 * Both exchanges publish the common UDiFF CSV (`BhavCopy_<EX>_CM_0_0_0_<yyyymmdd>_F_0000`):
 * a header line, then one unquoted row per instrument. Columns are found by header name, so
 * a reordered file still reads; a missing column throws. A row is keyed by its ticker symbol
 * (`TckrSymb`, e.g. `RELIANCE`, `M&M`) and priced at its close (`ClsPric`). A row that doesn't
 * read is skipped and counted, never fatal.
 */
import { isPrice } from "./price";
import type { Universe } from "./universe";

/**
 * Series kept: equity shares and the unit trusts that trade like them. Debt, government
 * securities, T-bills, gold bonds (`GB`/`G`: not ETFs), rights entitlements and block-deal
 * windows are left out. Any series is kept for an `INF…` ISIN (fund units), which is how an
 * ETF reads whatever series it trades in (BSE lists liquid ETFs under `F`, some under `B`).
 */
const SERIES: Readonly<Record<"nse" | "bse", ReadonlySet<string>>> = {
  // EQ main board (ETFs included), BE/BZ trade-for-trade, SM/ST SME, IV InvIT, RR REIT.
  nse: new Set(["EQ", "BE", "BZ", "SM", "ST", "IV", "RR"]),
  // A/B/T/X/XT/Z/M/MT/MS/TS/P equity groups, E ETFs, IF InvITs and REITs.
  bse: new Set([
    "A",
    "B",
    "T",
    "X",
    "XT",
    "Z",
    "M",
    "MT",
    "MS",
    "TS",
    "P",
    "E",
    "IF",
  ]),
};

const COLUMNS = [
  "TradDt",
  "ISIN",
  "TckrSymb",
  "SctySrs",
  "FinInstrmNm",
  "ClsPric",
] as const;

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const SYMBOL = /^[A-Z0-9&._-]{1,32}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface BhavcopyResult {
  universe: Universe;
  /** Rows in a kept series that didn't read (bad symbol, close or date), or repeated a symbol. */
  skipped: number;
}

function parse(
  kind: "nse" | "bse",
  text: string,
  fetchedAt: string,
): BhavcopyResult {
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? "").replace(/^﻿/, "").split(",");
  const at = Object.fromEntries(
    COLUMNS.map((c) => {
      const i = header.indexOf(c);
      if (i < 0) throw new RangeError(`bhavcopy has no ${c} column`);
      return [c, i];
    }),
  ) as Record<(typeof COLUMNS)[number], number>;

  const prices: Record<string, string> = {};
  const names: Record<string, string> = {};
  const isins: Record<string, string> = {};
  let date = "";
  let skipped = 0;

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const f = line.split(",").map((x) => x.trim());
    const isin = f[at.ISIN] ?? "";
    if (!SERIES[kind].has(f[at.SctySrs]) && !isin.startsWith("INF")) continue;
    const symbol = (f[at.TckrSymb] ?? "").toUpperCase();
    const close = f[at.ClsPric] ?? "";
    const day = f[at.TradDt] ?? "";
    if (
      !SYMBOL.test(symbol) ||
      !isPrice(close) ||
      !DATE.test(day) ||
      (date && day !== date) ||
      Object.hasOwn(prices, symbol)
    ) {
      skipped++;
      continue;
    }
    date = day;
    prices[symbol] = close;
    const name = (f[at.FinInstrmNm] ?? "").replace(/\s+/g, " ").slice(0, 200);
    if (name) names[symbol] = name;
    if (ISIN.test(isin)) isins[isin] = symbol;
  }

  if (!date) throw new RangeError("no prices in the bhavcopy");
  return {
    universe: {
      kind,
      date,
      fetchedAt,
      source: `${kind.toUpperCase()} bhavcopy`,
      currency: "INR",
      prices,
      names,
      isins,
    },
    skipped,
  };
}

/** Parses NSE's cash-market bhavcopy. Throws `RangeError` when no row reads. */
export const parseNse = (text: string, fetchedAt: string) =>
  parse("nse", text, fetchedAt);

/** Parses BSE's cash-market bhavcopy. Throws `RangeError` when no row reads. */
export const parseBse = (text: string, fetchedAt: string) =>
  parse("bse", text, fetchedAt);
