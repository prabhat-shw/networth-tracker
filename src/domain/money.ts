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

/** Applies an ownership share (percent) to an amount, rounded to the nearest paisa. */
export function share(amount: Paise, sharePercent: number): Paise {
  return Math.round((amount * sharePercent) / 100);
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
