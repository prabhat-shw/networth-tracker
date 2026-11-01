# ADR-0071 — M5 design: lens store, timeline, goal maths, rules, returns

**Status:** Accepted · 2026-11-01 · issue #191 · settles `docs/phases/M5.md` Q1–Q8, builds on [ADR-0053](0053-goals-and-unallocated.md), [ADR-0060](0060-goals-screen-basic.md), [ADR-0070](0070-daily-snapshots.md)

## Context

M5 draws the timeline, gives goals a status, and adds Insights. The brief left eight
questions open. This ADR answers them. Its code is the pure goal maths only. Each answer's
UI ships in the issue named next to it.

## Decision

1. **Lens store** (#192). One Zustand store per device, held in memory and reset on lock.
   It is never synced. Home, Accounts, Goals and the timeline all read it.
2. **Timeline series** (#193). One point per snapshot `date` plus today's live figure, from a
   pure `src/domain/timeline.ts`. Gaps are not interpolated. If a date has two snapshots, the
   later stamp wins (ADR-0070 §5). Former members come from `formerMembers`.
3. **Goal maths** (`src/domain/goals/projection.ts`). Money stays integer paise.
   Dimensionless growth factors are float64 from basis points, and each money result is
   rounded once: half-up for targets and corpora, **up** for the required SIP, so paying it
   always suffices. Time runs in whole calendar months, at the effective monthly rate
   `(1+r)^(1/12) − 1`, with the SIP paid at each month end. Status is **on track** when
   projected ≥ 100% of the inflated target, **at risk** at ≥ 80%, otherwise **off track**.
   A goal with no whole month left is `targetPassed`, shown as an Alert. A zero return is
   valid. A negative earmark (a loan bigger than its asset) projects as zero.
4. **Current SIP** (#195). An optional `monthlyContribution` (paise) on the goal record.
   Goal schema v2 has an identity upgrade from v1. Older builds keep a v2 record untouched
   (ADR-0051). M6 may derive the figure from imported transactions.
5. **Auto-tag rules** (#197). Stored on the goal they feed, as
   `autoTag: { kinds[], instrumentCodes[], bps }`, in the same schema version as (4). No new
   record type. A rule pre-fills the tag on create or edit, and the user can remove it. A
   confirmed bulk action applies rules to untagged records only. A rule never rewrites an
   existing tag.
6. **Transaction entry** (#198). In/out legs and linked transfers (ADR-0062) on an account.
   Lot entry and the sell flow (`consumeFifo`) stay in M6.
7. **XIRR inputs** (#199). The window opens with the first snapshot inside it, or with an
   account's first transaction. The flows are the window's transactions, and today's valuation
   closes it. Solved by bisection. Property, gold and money lent are excluded. EPF, PPF, NPS
   and SSY show a declared rate instead (UX §11.2).
8. **Price history** (#29, #30). Stored universes reach back only to M4's first ingest.
   Commission drag runs from the later of the lot date and the oldest stored NAV pair, and its
   copy says so. The Nifty 50 TRI is a new universe kind, plus a one-off load of its public
   history file. That is one whole series, so it leaks nothing.

**Suitability** (`src/domain/goals/suitability.ts`) classifies by record kind, never by label:

- Volatile kinds (mutual fund, whose category is unknown, stock, US stock, RSU, crypto,
  unlisted) funding a goal less than 36 months away.
- A maturity date after the target date.
- EPF or NPS funding a goal other than retirement.
- Property, vehicles, valuables or a chit fund funding an emergency goal.

## Consequences

- Every goal figure rounds once. float64 is exact to the paisa below ₹10 lakh
  crore, and tests check the SIP against 50-digit decimal fixtures.
- A debt mutual fund near its target gets a false "volatile" warning until fund categories
  are known (M6, AMFI scheme types). Goal schema v2 lands with #195; until then
  `projectGoal` takes the contribution as an input.
