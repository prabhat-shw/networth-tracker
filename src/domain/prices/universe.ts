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

/**
 * The file the server serves and the client caches. `date` is the trading day the prices are
 * for; `fetchedAt` is when the server ingested them. `fx` prices are rupees per unit of the
 * currency code; `metal` prices are rupees per gram (`gold999`, `silver999`).
 */
export const universe = z.strictObject({
  kind: z.enum(UNIVERSE_KINDS),
  date: z.iso.date(),
  fetchedAt: z.iso.datetime(),
  source: z.string().min(1).max(80),
  currency: z.string().regex(/^[A-Z]{3}$/),
  prices: z.record(z.string().min(1).max(32), price),
});
export type Universe = z.infer<typeof universe>;

export type Universes = Partial<Record<UniverseKind, Universe>>;

export interface Quote {
  price: string;
  currency: string;
  /** The trading day of the price, for the "as of" caption. */
  date: string;
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
  return { price: u.prices[code], currency: u.currency, date: u.date };
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
