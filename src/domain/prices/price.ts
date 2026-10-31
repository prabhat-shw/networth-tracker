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

const SCALE = BigInt(10) ** BigInt(PRICE_PLACES);

/** Formats 10⁻¹² units as a price string, without trailing zeros. */
export function fromPriceUnits(units: bigint): string {
  const whole = units / SCALE;
  const frac = (units % SCALE)
    .toString()
    .padStart(PRICE_PLACES, "0")
    .replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/**
 * A price from a JSON number, the way feeds send it. It goes through the number's shortest
 * decimal spelling, which is the feed's own text (`3.53699e-7` → `"0.000000353699"`), never
 * through float arithmetic. Rounded half-up past 12 decimals. Undefined for a negative,
 * non-finite or too-large number.
 */
export function priceFromNumber(n: unknown): string | undefined {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return undefined;
  const [mantissa, exp = "0"] = n.toString().split("e");
  const dot = mantissa.indexOf(".");
  const digits = mantissa.replace(".", "");
  const point = (dot < 0 ? mantissa.length : dot) + Number(exp);
  const whole = point <= 0 ? "0" : digits.slice(0, point).padEnd(point, "0");
  const frac = point <= 0 ? "0".repeat(-point) + digits : digits.slice(point);
  const up = (frac[PRICE_PLACES] ?? "0") >= "5" ? BigInt(1) : BigInt(0);
  const units =
    BigInt(whole) * SCALE +
    BigInt(frac.slice(0, PRICE_PLACES).padEnd(PRICE_PLACES, "0")) +
    up;
  const price = fromPriceUnits(units);
  return isPrice(price) ? price : undefined;
}

/** `a ÷ b` as a price, rounded half-up at 12 decimals. Throws `RangeError` when `b` is 0. */
export function ratio(a: string, b: string): string {
  const d = toPriceUnits(b);
  if (d === BigInt(0)) throw new RangeError("division by zero");
  const n = toPriceUnits(a) * SCALE * BigInt(2);
  return fromPriceUnits((n + d) / (d * BigInt(2)));
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
