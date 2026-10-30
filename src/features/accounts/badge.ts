/**
 * Row annotations for the Accounts list (UX.md §2.1, §3.4). Pure: names come in through
 * `nameOf`, so a member with no profile reads "Former member" (ADR-0054).
 */
import type { Paise } from "@/domain/money";
import type { Owner } from "@/domain/networth";
import { type Allocation, allocatedPaise } from "@/domain/records/common";
import { bpsToPercent } from "@/features/add/kinds";

/**
 * Who else owns this, from the viewer's side: nothing when it is all theirs, "Bala's" when
 * it is someone else's, "◐ 50/50 · Bala" when shared. The viewer's share is listed first.
 */
export function ownershipBadge(
  owners: readonly Owner[],
  me: string,
  nameOf: (memberId: string) => string,
): string | null {
  const [only] = owners;
  if (owners.length === 1 && only)
    return only.memberId === me ? null : `${nameOf(only.memberId)}'s`;
  const ordered = [
    ...owners.filter((o) => o.memberId === me),
    ...owners.filter((o) => o.memberId !== me),
  ];
  const split = ordered.map((o) => bpsToPercent(o.shareBps)).join("/");
  const others = ordered
    .filter((o) => o.memberId !== me)
    .map((o) => nameOf(o.memberId))
    .join(", ");
  return `◐ ${split} · ${others}`;
}

/** Whole percent of the value earmarked to goals, rounded down and capped at 100. */
export function taggedPercent(
  allocations: readonly Allocation[],
  value: Paise,
): number {
  if (value <= 0) return 0;
  const claimed = Math.min(allocatedPaise(allocations, value), value);
  return Math.floor((claimed * 100) / value);
}
