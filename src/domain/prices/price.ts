/**
 * Prices and valuation maths (ADR-0064). Pure and integer-only.
 *
 * A price is a decimal string per unit in its own currency, like a `quantity` but with up to
 * 12 decimals (a crypto coin can trade at $0.000009). An FX rate is a price of one unit of a
 * currency in rupees. `marketValue` multiplies all three as bigints and rounds half-up to paise
 * exactly once, at the end, so no intermediate figure is ever rounded or a float.
 */
import type { Paise } from "../money";
import { isQuantity, toUnits } from "../units";

const PRICE_PLACES = 12;
const UNIT_PLACES = 8;

/** Up to 15 whole digits and 12 decimals, no sign. */
export const PRICE = /^(0|[1-9]\d{0,14})(\.\d{1,12})?$/;

export const isPrice = (s: string) => PRICE.test(s);

/** A price as an integer of 10⁻¹² of its currency. Expects a valid price string. */
export function toPriceUnits(price: string): bigint {
  const [whole, frac = ""] = price.split(".");
  return (
    BigInt(whole) * BigInt(10) ** BigInt(PRICE_PLACES) +
    BigInt(frac.padEnd(PRICE_PLACES, "0"))
  );
}

/** One rupee in rupees: the FX rate of an INR price. */
export const INR = "1";

/**
 * What `quantity` units at `price` are worth in paise, converting with `fx` (rupees per unit of
 * the price's currency; `INR` for rupee prices). Rounded half-up to the paisa, once. Throws
 * `RangeError` on a malformed input or a value past `Number.MAX_SAFE_INTEGER` paise.
 */
export function marketValue(quantity: string, price: string, fx = INR): Paise {
  if (!isQuantity(quantity) || !isPrice(price) || !isPrice(fx))
    throw new RangeError("not a quantity, price or rate");
  const product = toUnits(quantity) * toPriceUnits(price) * toPriceUnits(fx);
  // product is in 10⁻(8+12+12) rupees; paise = rupees × 100.
  const divisor = BigInt(10) ** BigInt(UNIT_PLACES + 2 * PRICE_PLACES - 2);
  const paise = (product * BigInt(2) + divisor) / (divisor * BigInt(2));
  if (paise > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError("value too large");
  return Number(paise);
}
