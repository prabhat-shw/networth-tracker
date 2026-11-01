/**
 * Suitability warnings: a funding source that doesn't fit the goal it is earmarked to
 * (PLAN.md §1.1, UX.md §3.7, ADR-0071). Pure; classified by record kind, never by the
 * free-text label (UX.md §12.5).
 */
import type { Paise } from "../money";
import type { AssetData, AssetKind } from "../records/asset";
import type { GoalKind } from "../records/goal";
import { monthsUntil } from "./projection";

/** Kinds whose value can fall sharply in a year. A mutual fund counts: its category is unknown. */
const VOLATILE: ReadonlySet<AssetKind> = new Set([
  "mutualFund",
  "stock",
  "usStock",
  "rsu",
  "crypto",
  "unlisted",
]);

/** Locked until retirement, whatever the record says. */
const RETIREMENT_LOCKED: ReadonlySet<AssetKind> = new Set(["epf", "nps"]);

/** Slow to turn into cash. */
const ILLIQUID: ReadonlySet<AssetKind> = new Set([
  "realEstate",
  "vehicle",
  "valuable",
  "chitFund",
]);

/** Volatile money should not fund a goal closer than this. */
export const VOLATILE_MIN_MONTHS = 36;

export type Warning =
  | { code: "volatileShortHorizon"; recordId: string }
  | { code: "locksPastTarget"; recordId: string; until: string }
  | { code: "retirementLocked"; recordId: string }
  | { code: "illiquidEmergency"; recordId: string };

export interface FundingSource {
  recordId: string;
  kind: AssetKind;
  /** The amount earmarked to this goal; a source with no claim is skipped. */
  claim: Paise;
  /** Maturity or lock-in end, when the record has one. */
  lockedUntil?: string;
}

/** A record's maturity date, if its kind carries one. */
export function lockedUntil(asset: AssetData): string | undefined {
  return "maturityDate" in asset ? asset.maturityDate : undefined;
}

export function suitability(
  goal: { kind: GoalKind; targetDate: string },
  sources: readonly FundingSource[],
  today: string,
): Warning[] {
  const months = monthsUntil(today, goal.targetDate);
  const out: Warning[] = [];
  for (const s of sources) {
    if (s.claim <= 0) continue;
    const recordId = s.recordId;
    if (VOLATILE.has(s.kind) && months < VOLATILE_MIN_MONTHS) {
      out.push({ code: "volatileShortHorizon", recordId });
    }
    if (RETIREMENT_LOCKED.has(s.kind) && goal.kind !== "retirement") {
      out.push({ code: "retirementLocked", recordId });
    }
    if (s.lockedUntil && s.lockedUntil > goal.targetDate) {
      out.push({ code: "locksPastTarget", recordId, until: s.lockedUntil });
    }
    if (ILLIQUID.has(s.kind) && goal.kind === "emergency") {
      out.push({ code: "illiquidEmergency", recordId });
    }
  }
  return out;
}
