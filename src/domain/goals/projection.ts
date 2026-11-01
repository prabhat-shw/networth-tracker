/**
 * Goal maths (PLAN.md §1.1, UX.md §3.6–3.7, ADR-0071). Pure.
 *
 * Money is integer paise in and out. A growth factor such as `(1 + i)^years` is a
 * dimensionless ratio, so it is computed in float64 from basis points; each money result is
 * rounded to the paisa exactly once (ADR-0071 §3). float64 keeps 15 significant digits, so a
 * result stays exact to the paisa below ₹10 lakh crore.
 *
 * Time runs in whole calendar months from today to the target date. Returns compound
 * monthly at the effective rate `(1 + r)^(1/12) − 1`, and a SIP is paid at each month end.
 */
import type { Paise } from "../money";

const BPS = 10_000;

/** Why a goal can't be projected. The UI shows an Alert, never NaN (UX.md §3.7). */
export type GoalError = "targetPassed";

export type GoalStatus = "onTrack" | "atRisk" | "offTrack";

/** At or above this share of the inflated target a goal is "at risk", not "off track". */
export const AT_RISK_BPS = 8_000;

/** Whole calendar months from `today` to `target` (ISO dates); a part month doesn't count. */
export function monthsUntil(today: string, target: string): number {
  const [ty, tm, td] = today.split("-").map(Number);
  const [gy, gm, gd] = target.split("-").map(Number);
  const months = (gy - ty) * 12 + (gm - tm) - (gd < td ? 1 : 0);
  return Math.max(0, months);
}

/** Effective monthly rate for an annual rate in basis points. */
function monthlyRate(annualBps: number): number {
  return (1 + annualBps / BPS) ** (1 / 12) - 1;
}

/** `(1 + r)^(months / 12)`: the growth of one rupee over `months`. */
export function growthFactor(annualBps: number, months: number): number {
  return (1 + annualBps / BPS) ** (months / 12);
}

/** Today's-rupees target in rupees of the target month. */
export function inflatedTarget(
  target: Paise,
  inflationBps: number,
  months: number,
): Paise {
  return Math.round(target * growthFactor(inflationBps, months));
}

/** What `present` grows to in `months`, plus a SIP of `monthly` paid at each month end. */
export function projectedCorpus(
  present: Paise,
  monthly: Paise,
  returnBps: number,
  months: number,
): Paise {
  const lump = present * growthFactor(returnBps, months);
  return Math.round(lump + monthly * annuityFactor(returnBps, months));
}

/** Future value of ₹1 a month for `months` months (ordinary annuity). */
function annuityFactor(returnBps: number, months: number): number {
  const j = monthlyRate(returnBps);
  return j === 0 ? months : ((1 + j) ** months - 1) / j;
}

/**
 * The monthly SIP that, added to `present` growing alone, reaches `target` in `months`.
 * Rounded **up** to the paisa so paying it is always enough; 0 when nothing is missing.
 */
export function requiredMonthlySip(
  target: Paise,
  present: Paise,
  returnBps: number,
  months: number,
): Paise | GoalError {
  if (months <= 0) return "targetPassed";
  const gap = target - present * growthFactor(returnBps, months);
  if (gap <= 0) return 0;
  // Clear float noise below a millionth of a paisa before rounding up.
  const sip = gap / annuityFactor(returnBps, months);
  return Math.ceil(sip - 1e-6);
}

/** On track at ≥ 100% of the inflated target, at risk at ≥ 80%, off track below. */
export function goalStatus(projected: Paise, target: Paise): GoalStatus {
  if (projected >= target) return "onTrack";
  return projected * BPS >= target * AT_RISK_BPS ? "atRisk" : "offTrack";
}

export interface GoalInput {
  targetAmount: Paise;
  targetDate: string;
  inflationBps: number;
  expectedReturnBps: number;
  /** Earmarked to the goal now (`earmarks().byGoal`); a negative net counts as zero. */
  earmarked: Paise;
  /** The SIP the household puts in today (ADR-0071 §4); 0 when unknown. */
  monthlyContribution: Paise;
}

export interface GoalProjection {
  months: number;
  inflatedTarget: Paise;
  /** Earmarked ÷ inflated target, floored, capped at 100%. */
  progressBps: number;
  /** Inflated target − earmarked, never below 0. */
  shortfall: Paise;
  /** Earmarked plus the current SIP, grown to the target date. */
  projected: Paise;
  requiredMonthlySip: Paise;
  status: GoalStatus;
}

/** Every derived figure a goal card and goal detail show, or why it can't be computed. */
export function projectGoal(
  goal: GoalInput,
  today: string,
): GoalProjection | GoalError {
  const months = monthsUntil(today, goal.targetDate);
  if (months <= 0) return "targetPassed";
  const target = inflatedTarget(goal.targetAmount, goal.inflationBps, months);
  const present = Math.max(0, goal.earmarked);
  const sip = requiredMonthlySip(
    target,
    present,
    goal.expectedReturnBps,
    months,
  );
  if (typeof sip === "string") return sip;
  const projected = projectedCorpus(
    present,
    goal.monthlyContribution,
    goal.expectedReturnBps,
    months,
  );
  return {
    months,
    inflatedTarget: target,
    progressBps: Math.min(BPS, Math.floor((present * BPS) / target)),
    shortfall: Math.max(0, target - present),
    projected,
    requiredMonthlySip: sip,
    status: goalStatus(projected, target),
  };
}
