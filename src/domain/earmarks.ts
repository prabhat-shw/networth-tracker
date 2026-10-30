/**
 * How much of the household's money is earmarked to each goal, and how much is Unallocated
 * (PLAN.md §1.1, ADR-0053). Pure and integer-only: every amount is paise.
 *
 * Household view by default; under a member's lens each claim and the remainder are split
 * by ownership share like the value itself (ADR-0055).
 */
import type { Paise } from "./money";
import { type Lens, lensAmount, type Owner } from "./networth";
import { type Allocation, allocatedPaise } from "./records/common";

export interface EarmarkSource {
  side: "asset" | "liability";
  /** Current value, ≥ 0: what it is worth, or what is still owed. */
  value: Paise;
  includeInNetWorth: boolean;
  allocations: readonly Allocation[];
  owners: readonly Owner[];
}

/**
 * Each goal's claim on one record. When the claims add up to more than the value (a fixed
 * amount after a price fall), every claim is scaled down in proportion, so no goal is
 * silently favoured and the record is never more than 100% earmarked.
 */
export function claims(
  list: readonly Allocation[],
  value: Paise,
): Map<string, Paise> {
  const out = new Map<string, Paise>();
  if (value <= 0) return out;
  const total = allocatedPaise(list, value);
  for (const a of list) {
    const raw = allocatedPaise([a], value);
    // BigInt: value × raw can pass 2^53 for crore-sized records.
    const claim =
      total <= value
        ? raw
        : Number((BigInt(raw) * BigInt(value)) / BigInt(total));
    if (claim > 0) out.set(a.goalId, claim);
  }
  return out;
}

/** The part of one record no goal claims. */
export function unallocatedOf(source: EarmarkSource): Paise {
  let claimed = 0;
  for (const c of claims(source.allocations, source.value).values())
    claimed += c;
  return source.value - claimed;
}

export interface Earmarks {
  /** Per goal: claims on assets minus claims on liabilities (a house nets its home loan). */
  byGoal: Map<string, Paise>;
  /**
   * Net worth not earmarked to any goal: unallocated assets minus unallocated debt. It can
   * be negative, which honestly says the household owes more than it holds unearmarked.
   */
  unallocated: Paise;
}

/**
 * Sums earmarks over the household's records. Records outside net worth are skipped
 * entirely. A claim on a goal not in `goalIds` (deleted, or not synced yet) counts as
 * Unallocated, so deleting a goal frees its money without rewriting every record.
 */
export function earmarks(
  sources: readonly EarmarkSource[],
  goalIds: ReadonlySet<string>,
  lens: Lens = "household",
): Earmarks {
  const byGoal = new Map<string, Paise>();
  let unallocated = 0;
  for (const s of sources) {
    if (!s.includeInNetWorth) continue;
    const sign = s.side === "asset" ? 1 : -1;
    let claimed = 0;
    for (const [goalId, claim] of claims(s.allocations, s.value)) {
      if (!goalIds.has(goalId)) continue;
      const part = lensAmount(claim, s.owners, lens);
      claimed += part;
      byGoal.set(goalId, (byGoal.get(goalId) ?? 0) + sign * part);
    }
    // The lens's share of the value, less its share of the claims: Unallocated per lens.
    unallocated += sign * (lensAmount(s.value, s.owners, lens) - claimed);
  }
  return { byGoal, unallocated };
}
