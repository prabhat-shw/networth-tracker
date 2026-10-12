/**
 * Last-write-wins at record level (ADR-0003, ADR-0045). The clock lives inside the encrypted
 * record: the later `modifiedAt` wins; a tie goes to the greater `modifiedBy`, so every device
 * picks the same winner. A tombstone is an ordinary write here: a delete beats an older edit,
 * and a newer edit beats (revives) an older delete.
 */

export interface LwwStamp {
  /** Client clock, `Date#toISOString` (fixed width, so string order is time order). */
  modifiedAt: string;
  modifiedBy: string;
}

/** Positive when `a` is the later write, negative when `b` is, 0 for the same stamp. */
export function compareStamps(a: LwwStamp, b: LwwStamp): number {
  if (a.modifiedAt !== b.modifiedAt)
    return a.modifiedAt > b.modifiedAt ? 1 : -1;
  if (a.modifiedBy !== b.modifiedBy)
    return a.modifiedBy > b.modifiedBy ? 1 : -1;
  return 0;
}

/** The winning write. Identical stamps keep `local`, so a merge never churns. */
export function mergeLww<T extends LwwStamp>(local: T, remote: T): T {
  return compareStamps(remote, local) > 0 ? remote : local;
}
