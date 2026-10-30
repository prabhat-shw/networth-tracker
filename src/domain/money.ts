/**
 * Money is integer paise everywhere in this app (CLAUDE.md invariant). Floats are banned:
 * 0.1 + 0.2 must never be allowed near a net-worth total.
 */

export type Paise = number;

const PAISE_PER_RUPEE = 100;

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

export function paiseToRupees(paise: Paise): number {
  return paise / PAISE_PER_RUPEE;
}

/**
 * Splits an amount by integer weights (ownership shares in basis points) so the parts add
 * up to the amount exactly: each part rounds down, then the leftover paise go one each to
 * the largest remainders, ties to the lowest key. Deterministic on every device, and a
 * household total always equals the sum of its members' lenses (ADR-0055). BigInt because
 * amount × weight can pass 2^53 for crore-sized records.
 */
export function splitByWeight(
  amount: Paise,
  weights: readonly { key: string; weight: number }[],
): Map<string, Paise> {
  const total = weights.reduce((t, w) => t + w.weight, 0);
  const out = new Map<string, Paise>();
  if (total <= 0) return out;
  const big = BigInt(amount);
  const zero = BigInt(0);
  const one = BigInt(1);
  const parts = weights.map((w) => {
    const scaled = big * BigInt(w.weight);
    const floor = scaled / BigInt(total);
    // Truncating division rounds toward zero; step down for negative amounts.
    const down = scaled % BigInt(total) < zero ? floor - one : floor;
    return { key: w.key, part: down, rest: scaled - down * BigInt(total) };
  });
  let leftover = big - parts.reduce((t, p) => t + p.part, zero);
  const byRest = [...parts].sort((a, b) =>
    a.rest === b.rest ? (a.key < b.key ? -1 : 1) : a.rest > b.rest ? -1 : 1,
  );
  for (const p of byRest) {
    if (leftover <= zero) break;
    p.part += one;
    leftover -= one;
  }
  for (const p of parts) out.set(p.key, (out.get(p.key) ?? 0) + Number(p.part));
  return out;
}

export function sum(amounts: readonly Paise[]): Paise {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/**
 * Indian digit grouping: ₹12,34,567.89 — last three digits, then pairs.
 * `compact` renders the way Indians actually speak money: ₹12.35 L, ₹1.23 Cr.
 */
export function formatINR(
  paise: Paise,
  options: { compact?: boolean; decimals?: boolean } = {},
): string {
  const rupees = paiseToRupees(paise);
  const sign = rupees < 0 ? "-" : "";
  const abs = Math.abs(rupees);

  if (options.compact) {
    if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)} Cr`;
    if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)} L`;
    if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)} K`;
  }

  const fractionDigits = options.decimals ? 2 : 0;
  return `${sign}₹${abs.toLocaleString("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

function trim(value: number): string {
  // toFixed always leaves a decimal point, so stripping the trailing zero run is safe.
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
