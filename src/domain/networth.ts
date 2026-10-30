/**
 * Net worth per ownership lens (UX.md §2.1, ADR-0055). Pure and integer-only.
 *
 * Household: full value of every record in net worth. A member's lens (Me is the viewer's
 * own): their share of each record, split with `splitByWeight` so the members' lenses, plus
 * any share still held by a former member, always add up to Household to the paisa.
 */
import { type Paise, splitByWeight } from "./money";
import type { AssetData } from "./records/asset";
import type { LiabilityData } from "./records/liability";

export type Lens = "household" | { memberId: string };

export interface Owner {
  memberId: string;
  shareBps: number;
}

export interface BalanceItem {
  side: "asset" | "liability";
  /** What it counts for in net worth, ≥ 0 (see `netWorthValue`). */
  value: Paise;
  includeInNetWorth: boolean;
  owners: readonly Owner[];
}

/**
 * The amount a record contributes. `value` already excludes unvested RSUs (they are a unit
 * count, `unvested`, never money) and term cover is ₹0 by schema; the check here keeps it ₹0
 * even if an older record slipped through.
 */
export function netWorthValue(data: AssetData | LiabilityData): Paise {
  if (data.kind === "insurance" && data.policyType === "term") return 0;
  return data.value;
}

export function assetItem(data: AssetData): BalanceItem {
  return { side: "asset", ...pick(data) };
}

export function liabilityItem(data: LiabilityData): BalanceItem {
  return { side: "liability", ...pick(data) };
}

function pick(data: AssetData | LiabilityData) {
  return {
    value: netWorthValue(data),
    includeInNetWorth: data.includeInNetWorth,
    owners: data.owners,
  };
}

/** Each owner's part of `amount`, in paise, adding up to `amount` exactly. */
export function ownerSplit(
  amount: Paise,
  owners: readonly Owner[],
): Map<string, Paise> {
  return splitByWeight(
    amount,
    owners.map((o) => ({ key: o.memberId, weight: o.shareBps })),
  );
}

/** What one amount on a record is worth under a lens. */
export function lensAmount(
  amount: Paise,
  owners: readonly Owner[],
  lens: Lens,
): Paise {
  if (lens === "household") return amount;
  return ownerSplit(amount, owners).get(lens.memberId) ?? 0;
}

export interface NetWorth {
  assets: Paise;
  liabilities: Paise;
  /** assets − liabilities; negative when the lens owes more than it holds. */
  net: Paise;
}

const ZERO: NetWorth = { assets: 0, liabilities: 0, net: 0 };

function add(total: NetWorth, side: BalanceItem["side"], amount: Paise) {
  if (side === "asset") {
    total.assets += amount;
    total.net += amount;
  } else {
    total.liabilities += amount;
    total.net -= amount;
  }
}

/** Net worth under one lens. Records outside net worth are skipped. */
export function netWorth(items: readonly BalanceItem[], lens: Lens): NetWorth {
  const total = { ...ZERO };
  for (const item of items) {
    if (!item.includeInNetWorth) continue;
    add(total, item.side, lensAmount(item.value, item.owners, lens));
  }
  return total;
}

export interface AllLenses {
  household: NetWorth;
  /** One entry per current member, even one who owns nothing yet. */
  byMember: Map<string, NetWorth>;
  /**
   * Shares still pointing at members who left (ADR-0054's "Former member"). They stay in
   * Household, since the record is still the household's, and in no member's lens.
   */
  formerMembers: NetWorth;
}

/** Every lens in one pass; `household` = Σ `byMember` + `formerMembers`, exactly. */
export function allLenses(
  items: readonly BalanceItem[],
  memberIds: Iterable<string>,
): AllLenses {
  const household = { ...ZERO };
  const formerMembers = { ...ZERO };
  const byMember = new Map<string, NetWorth>();
  for (const id of memberIds) byMember.set(id, { ...ZERO });
  for (const item of items) {
    if (!item.includeInNetWorth) continue;
    add(household, item.side, item.value);
    for (const [id, part] of ownerSplit(item.value, item.owners))
      add(byMember.get(id) ?? formerMembers, item.side, part);
  }
  return { household, byMember, formerMembers };
}
