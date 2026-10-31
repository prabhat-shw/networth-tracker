/**
 * Frankfurter `latest` → the `fx` universe (ADR-0064, #165). Pure: the server asks once for
 * every rate against EUR (ECB reference rates) and hands the body here.
 *
 * The universe prices each currency in rupees per unit, the rate `marketValue` takes. With
 * base EUR, `INR per X = (INR per EUR) ÷ (X per EUR)`, divided as bigints and rounded half-up
 * at 12 decimals. Asking with base INR instead would return rates already rounded to a few
 * digits, and inverting them loses precision. INR itself is never listed: `fxRate` answers 1.
 */
import { z } from "zod";
import { priceFromNumber, ratio } from "./price";
import type { FeedResult } from "./universe";

const CURRENCY = /^[A-Z]{3}$/;

const body = z.object({
  base: z.string().regex(CURRENCY),
  date: z.iso.date(),
  rates: z.record(z.string(), z.unknown()),
});

/** Parses a Frankfurter body (a JSON value). Throws `RangeError` without an INR rate. */
export function parseFrankfurter(raw: unknown, fetchedAt: string): FeedResult {
  const parsed = body.safeParse(raw);
  if (!parsed.success) throw new RangeError("not a Frankfurter response");
  const { base, date, rates } = parsed.data;
  const inr = priceFromNumber(rates.INR);
  if (!inr || inr === "0") throw new RangeError("no INR rate");

  const prices: Record<string, string> = { [base]: inr };
  let skipped = 0;
  for (const [code, value] of Object.entries(rates)) {
    if (code === "INR") continue;
    const perBase = priceFromNumber(value);
    if (!CURRENCY.test(code) || !perBase || perBase === "0") {
      skipped++;
      continue;
    }
    prices[code] = ratio(inr, perBase);
  }

  return {
    universe: {
      kind: "fx",
      date,
      fetchedAt,
      source: "Frankfurter (ECB)",
      currency: "INR",
      prices,
    },
    skipped,
  };
}
