/**
 * Unit counts (MF units, shares, crypto) as integers of 10⁻⁸ units (ADR-0063). The records
 * store a decimal string (`quantity` in records/common.ts); sums and FIFO splits happen here
 * so 0.1 + 0.2 units is exactly 0.3.
 */
const PLACES = 8;
const SCALE = BigInt(10 ** PLACES);
const ZERO = BigInt(0);

/** A unit count as stored: up to 15 whole digits and 8 decimals, no sign. */
export const QUANTITY = /^(0|[1-9]\d{0,14})(\.\d{1,8})?$/;

export const isQuantity = (s: string) => QUANTITY.test(s);

/** `"12.5"` → 1 250 000 000. Expects a valid `quantity` string. */
export function toUnits(quantity: string): bigint {
  const [whole, frac = ""] = quantity.split(".");
  return BigInt(whole) * SCALE + BigInt(frac.padEnd(PLACES, "0"));
}

/** The inverse of `toUnits`, without trailing zeros: 1 250 000 000 → `"12.5"`. */
export function formatUnits(units: bigint): string {
  const whole = units / SCALE;
  const frac = (units % SCALE)
    .toString()
    .padStart(PLACES, "0")
    .replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function sumUnits(list: readonly { quantity: string }[]): bigint {
  return list.reduce((total, x) => total + toUnits(x.quantity), ZERO);
}
