# ADR-0017 — Minimum-effort UX: tap budgets per task

**Status:** Accepted · 2026-09-26

## Context

On review of the insights and projections pass (PR #17), the owner asked that the app be
user-friendly, taking the fewest actions or clicks to deliver each feature. The UX spec had
principles about *what* to show, but none that bounded *how much effort* a task may cost, so
feature richness could quietly turn into tap count.

## Decision

- Add **principle 8, "Fewest actions to the outcome"**, to `docs/UX.md` §0. It ranks the
  tactics: don't ask (defaults, remembered choices, derive or import rather than type), fix it
  where you see it (inline actions on every nudge), skip steps when intent is known, and use
  progressive disclosure instead of wizards.
- Define **tap budgets** for the core tasks, counted from an unlocked Home: 0 to see net worth,
  1 to switch lens, 2 to fix a stale value, 3 to add a frequently added asset, 4 via search,
  2 to tag to a goal, 1 to open an insight.
- A design over budget must justify itself in its spec section.
- **Enforced by tests, not by memory:** from M5, Playwright specs count taps for these tasks
  and fail when a budget is exceeded.

## Consequences

- Screens built in M3 (entry forms) and M5 (dashboard, insights) are reviewed against the
  budgets. The prototype is a design reference; its conformance is checked when each screen
  is implemented, not retrofitted now.
- New features in #25–#32 inherit the rule: for example, nominee gap alerts must let you add a
  nominee inline from the alert.
- Budgets can tighten over time; loosening one needs a new ADR.
