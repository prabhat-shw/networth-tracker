/**
 * Price universes (ADR-0064): one whole public price list per kind per day. The client
 * downloads every kind whatever the household holds, so no request names a holding
 * (ADR-0005), and looks instruments up here, on the device.
 */
import { z } from "zod";
import { INR, isPrice } from "./price";

/** One universe per instrument source, plus FX and precious metals. */
export const UNIVERSE_KINDS = [
  "amfi",
  "nse",
  "bse",
  "us",
  "crypto",
  "fx",
  "metal",
] as const;
export type UniverseKind = (typeof UNIVERSE_KINDS)[number];

const price = z.string().refine(isPrice, "a price, up to 12 decimals");
const code = z.string().min(1).max(32);

/**
 * The file the server serves and the client caches. `date` is the trading day the prices are
 * for; `fetchedAt` is when the server ingested them. `fx` prices are rupees per unit of the
 * currency code; `metal` prices are rupees per gram (`gold999`, `silver999`). The optional maps
 * serve the instrument picker (`names`), statement import by ISIN (`isins`, ISIN → code), and
 * codes whose own price date differs from `date`, such as a wound-up fund (`dates`).
 */
export const universe = z.strictObject({
  kind: z.enum(UNIVERSE_KINDS),
  date: z.iso.date(),
  fetchedAt: z.iso.datetime(),
  source: z.string().min(1).max(80),
  currency: z.string().regex(/^[A-Z]{3}$/),
  prices: z.record(code, price),
  names: z.record(code, z.string().min(1).max(200)).optional(),
  isins: z.record(z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/), code).optional(),
  dates: z.record(code, z.iso.date()).optional(),
});
export type Universe = z.infer<typeof universe>;

export type Universes = Partial<Record<UniverseKind, Universe>>;

/** What a feed parser returns. */
export interface FeedResult {
  universe: Universe;
  /** Entries that didn't read or repeated a code: logged by ingest, never fatal. */
  skipped: number;
}

export interface Quote {
  price: string;
  currency: string;
  /** The trading day of the price, for the "as of" caption. */
  date: string;
}

/**
 * The universe `date` for a feed that dates each code: the most common date (the latest on a
 * tie), with `dates` listing only the codes priced on another day. Undefined when empty.
 */
export function settleDates(
  perCode: Readonly<Record<string, string>>,
): { date: string; dates: Record<string, string> } | undefined {
  const count = new Map<string, number>();
  for (const d of Object.values(perCode)) count.set(d, (count.get(d) ?? 0) + 1);
  let date: string | undefined;
  for (const [d, n] of count) {
    const best = date === undefined ? 0 : (count.get(date) ?? 0);
    if (date === undefined || n > best || (n === best && d > date)) date = d;
  }
  if (date === undefined) return undefined;
  const dates: Record<string, string> = {};
  for (const [code, d] of Object.entries(perCode))
    if (d !== date) dates[code] = d;
  return { date, dates };
}

/** Exchange and coin codes are matched without case; AMFI codes are digits. */
export const normaliseCode = (code: string) => code.trim().toUpperCase();

/** The day's price for an instrument, if its universe is here and lists it. */
export function lookup(
  universes: Universes,
  instrument: { source: Exclude<UniverseKind, "fx" | "metal">; code: string },
): Quote | undefined {
  const u = universes[instrument.source];
  if (!u) return undefined;
  const code = normaliseCode(instrument.code);
  if (!Object.hasOwn(u.prices, code)) return undefined;
  const date = u.dates && Object.hasOwn(u.dates, code) ? u.dates[code] : u.date;
  return { price: u.prices[code], currency: u.currency, date };
}

/** Rupees per unit of `currency`: `"1"` for INR, else from the FX universe. */
export function fxRate(
  universes: Universes,
  currency: string,
): string | undefined {
  if (currency === "INR") return INR;
  const fx = universes.fx;
  return fx && Object.hasOwn(fx.prices, currency)
    ? fx.prices[currency]
    : undefined;
}
