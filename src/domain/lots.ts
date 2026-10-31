/**
 * Tax lots consumed first-in, first-out (#26, ADR-0063). Indian tax law applies FIFO to
 * listed equity and mutual fund units, so a sell always takes the oldest lot first. Pure and
 * integer-only: units in 10⁻⁸ (units.ts), cost and FMV in paise.
 */
import type { Paise } from "./money";
import type { Lot } from "./records/common";
import { formatUnits, sumUnits, toUnits } from "./units";

export interface FifoResult {
  /** The parts sold, oldest first, each carrying its share of cost and FMV. */
  sold: Lot[];
  /** What is still held, oldest first; a part-sold lot keeps the rest of its cost. */
  remaining: Lot[];
}

/** Oldest first; lots bought the same day keep their entered order (the sort is stable). */
export const fifoOrder = (lots: readonly Lot[]): Lot[] =>
  [...lots].sort((a, b) =>
    a.acquired < b.acquired ? -1 : a.acquired > b.acquired ? 1 : 0,
  );

/** `amount × part / whole`, rounded down. The remainder stays with the unsold part. */
const prorate = (amount: Paise, part: bigint, whole: bigint): Paise =>
  Number((BigInt(amount) * part) / whole);

function split(lot: Lot, take: bigint): [Lot, Lot] {
  const held = toUnits(lot.quantity);
  const cost = prorate(lot.cost, take, held);
  const fmv =
    lot.fmv2018 === undefined ? undefined : prorate(lot.fmv2018, take, held);
  const part = (quantity: bigint, c: Paise, f?: Paise): Lot => ({
    quantity: formatUnits(quantity),
    cost: c,
    acquired: lot.acquired,
    ...(f === undefined ? {} : { fmv2018: f }),
  });
  return [
    part(take, cost, fmv),
    part(
      held - take,
      lot.cost - cost,
      fmv === undefined ? undefined : (lot.fmv2018 as Paise) - fmv,
    ),
  ];
}

/**
 * Sells `quantity` units from `lots`. Costs and FMVs of sold and remaining parts add up to
 * the originals exactly. Throws `RangeError` when the lots hold fewer units than sold.
 */
export function consumeFifo(
  lots: readonly Lot[],
  quantity: string,
): FifoResult {
  let left = toUnits(quantity);
  if (left > sumUnits(lots))
    throw new RangeError("selling more units than the lots hold");
  const sold: Lot[] = [];
  const remaining: Lot[] = [];
  for (const lot of fifoOrder(lots)) {
    const held = toUnits(lot.quantity);
    if (left <= BigInt(0)) remaining.push(lot);
    else if (held <= left) {
      sold.push(lot);
      left -= held;
    } else {
      const [taken, kept] = split(lot, left);
      sold.push(taken);
      remaining.push(kept);
      left = BigInt(0);
    }
  }
  return { sold, remaining };
}
