/**
 * Contributions per ownership lens (UX.md §11.1, ADR-0062). Pure and integer-only.
 *
 * A contribution is money that came from outside the household's balance sheet; a
 * withdrawal is money that left it. A linked transfer (two legs sharing a `transferId`) is
 * neither in Household, since the money only moved. In a member's lens it counts as the
 * change in that member's share: Asha's savings into a joint 50/50 FD moves half of it to
 * Bala, so the members' lenses still add up to Household (zero) to the paisa.
 */
import type { Paise } from "./money";
import { type Lens, lensAmount, type Owner } from "./networth";
import type { TransactionData } from "./records/transaction";

export interface Contributions {
  added: Paise;
  withdrawn: Paise;
  /** added − withdrawn. */
  net: Paise;
}

/** Inclusive `YYYY-MM-DD` bounds; either side may be open. */
export interface DateRange {
  from?: string;
  to?: string;
}

export type TransferIssue =
  /** Only one leg is here: the other is unsynced, deleted or never entered. */
  | { transferId: string; problem: "missing-leg" }
  /** The legs disagree: more than two, same direction, same account, or unequal amounts. */
  | { transferId: string; problem: "mismatched" };

const inRange = (date: string, r: DateRange) =>
  (!r.from || date >= r.from) && (!r.to || date <= r.to);

function groupTransfers(legs: readonly TransactionData[]) {
  const groups = new Map<string, TransactionData[]>();
  for (const leg of legs) {
    if (!leg.transferId) continue;
    const group = groups.get(leg.transferId) ?? [];
    group.push(leg);
    groups.set(leg.transferId, group);
  }
  return groups;
}

function checkPair(
  legs: readonly TransactionData[],
): TransferIssue["problem"] | null {
  if (legs.length < 2) return "missing-leg";
  const [a, b] = legs;
  if (
    legs.length > 2 ||
    a.kind === b.kind ||
    a.accountId === b.accountId ||
    a.amount !== b.amount
  )
    return "mismatched";
  return null;
}

/** Transfers whose legs don't form one valid pair. They count nowhere until fixed. */
export function transferIssues(
  legs: readonly TransactionData[],
): TransferIssue[] {
  const issues: TransferIssue[] = [];
  for (const [transferId, group] of groupTransfers(legs)) {
    const problem = checkPair(group);
    if (problem) issues.push({ transferId, problem });
  }
  return issues;
}

/**
 * Contributions under one lens. `owners` maps an account id to its owners; a leg on an
 * account that isn't there (deleted, or not synced yet) counts in Household only. A transfer
 * is dated by its `out` leg and counts only when its pair is valid.
 */
export function contributions(
  legs: readonly TransactionData[],
  owners: ReadonlyMap<string, readonly Owner[]>,
  lens: Lens,
  range: DateRange = {},
): Contributions {
  const total = { added: 0, withdrawn: 0, net: 0 };
  const count = (amount: Paise) => {
    if (amount > 0) total.added += amount;
    else total.withdrawn -= amount;
    total.net += amount;
  };
  const signed = (leg: TransactionData) => {
    const accountOwners = owners.get(leg.accountId);
    const amount = accountOwners
      ? lensAmount(leg.amount, accountOwners, lens)
      : lens === "household"
        ? leg.amount
        : 0;
    return leg.kind === "in" ? amount : -amount;
  };

  for (const leg of legs)
    if (!leg.transferId && inRange(leg.date, range)) count(signed(leg));

  if (lens === "household") return total;
  for (const group of groupTransfers(legs).values()) {
    if (checkPair(group)) continue;
    const out = group.find((leg) => leg.kind === "out");
    if (out && inRange(out.date, range))
      count(signed(group[0]) + signed(group[1]));
  }
  return total;
}
