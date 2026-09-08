> **⚠️ NOTE ON SCOPE:** `CLAUDE.md` and `docs/CONTEXT.md` cap most committed docs at a few
> hundred lines so a fresh session can load them cheaply. This file is deliberately exempt —
> like `PLAN.md`, it is a **reference doc, read on demand** when a session touches UI, not on
> every session open. Do not shrink it to fit the general cap; do keep individual screen
> briefs it spawns (`docs/phases/M5.md` etc.) short and link back here instead of repeating it.

# UX Design Spec — NetWorth Tracker

Companion to `docs/PLAN.md`. This is the spec to implement screens from. The reviewable
walkthrough with sample data is `docs/ux/prototype.html` — open that alongside this document;
this file explains *why*, the prototype shows *what it looks like*.

---

## 0. Design principles (read before any screen spec)

These are the opinions everything below follows. When a future decision isn't covered here,
resolve it against these first.

1. **The visit is the test.** Most opens of this app last under 10 seconds: "what's my number,
   is anything wrong, done." Home must answer that in one screen, unscrolled, on a phone held
   one-handed. Everything else — accounts, goals, household — exists for the 20% of visits
   that come to *edit* or *investigate*, and can afford to cost more taps.
2. **Never show a number without saying whose it is.** INDMoney's failure mode is a single
   undifferentiated total. Every money figure on screen sits under an explicit, persistent
   lens (Me / Household / a named person). The lens is a *view mode*, not a destination — it
   is never a nav item, never buried in settings; it is a control you touch as often as you
   touch the back button.
3. **Untagged money is a visible nudge, not a rounding error.** "Unallocated" is a first-class
   state everywhere goals show up — a bucket you see and can tap to fix, never a number that
   silently disappears into "Other."
4. **Twenty asset types, one flow.** The user should never feel "which of 20 forms do I need."
   They feel "what did I add" (a mental category), then "which exact thing" (a short list),
   then a form that looks like every other form with 2–4 fields bolted on. Consistency of
   *shape* is what makes the long tail feel short.
5. **Honesty over liveness.** Prices update once a day. The UI never fakes a ticking number.
   Every valued figure can answer "as of when" on demand. Offline and syncing are shown, not
   hidden — a private finance app that lies about freshness is worse than one that admits it.
6. **Calm, not gamified.** No streaks, no red badges nagging you to open the app, no "you're
   behind your peers." The tone is a quiet, competent accountant — reassuring about privacy,
   plain about shortfalls, never anxious-making. Status uses colour + icon + words together,
   both because colour-only fails accessibility and because plain words read as calmer than a
   flashing red dot.
7. **Mobile is the primary device, the laptop is a different tool.** The phone gets one-handed
   flows and bottom sheets. The laptop gets dense tables, hover states, and keyboard shortcuts
   — not a phone screen stretched wide. Design both explicitly; never derive one from the other
   with just a breakpoint.

---

## 1. Information architecture

### 1.1 The nav model

**Mobile — 5-item bottom tab bar:** `Home` · `Accounts` · `Insights` · `Goals` · `More`.

```
┌─────────────────────────────────────┐
│                                      │
│              (screen)                │
│                                      │
├──────┬──────┬────────┬──────┬───────┤
│ Home │Accts │Insights│ Goals│  More │
└──────┴──────┴────────┴──────┴───────┘
        (FAB "+" floats above, bottom-right, on Home/Accounts/Insights/Goals)
```

**Why 5, not the 4 this document originally argued for.** The v1 spec deliberately capped the
bar at 4, reasoning that a tab is a *destination*, not an *action*, and that anything edited
rarely (Household, Security) belongs under "More." That reasoning still holds — what changed
is that owner feedback after the first review made insight and forecasting a **primary**
reason to open the app, not an occasional side-trip: "much better insight into net worth, also
future predictability." A feature the owner wants to reach as often as Goals earns a tab; a
feature reached rarely does not. This is the nav model's own rule applied honestly against new
evidence, not an exception to it — **frequency earns the tab slot, and frequency changed.**

**Why 5 and not fewer/more.** Merging Insights into Home was considered and rejected: Home's
whole job (Principle 1) is answering "what's my number and is anything wrong" in one
unscrolled screen — bolting a waterfall chart, a fan chart, and eight more cards onto it would
break that promise for the 80% of visits that don't want any of this. Insights earns its own
destination precisely *because* it's substantial enough to need one.

**Why not a 5th "Add" tab instead.** Unchanged from v1 — a tab that just opens a sheet and
returns you to where you were isn't a destination, and belongs on the floating "+" instead.

**Why Household & Security live under "More", not as their own tab.** They're edited rarely
(you invite your spouse once, you set biometric unlock once) but must stay reachable within
two taps from anywhere — `More → Household` and `More → Settings`. Frequency, not importance,
earns a tab slot.

**The lens switcher is not navigation.** It's a persistent, sticky control — a segmented
control fixed under the top app bar on every screen that shows money (Home, Net Worth Detail,
Accounts, Goals). It survives tab switches and back-navigation; leaving it set to "Household"
and moving from Home to Accounts keeps Accounts in Household view. This is the single most
important IA decision in the app: **navigation answers "where," the lens answers "whose."**
Conflating them (e.g., a "My View" tab) would make switching context require leaving the
screen you were reading — exactly the friction that makes multi-owner money hard everywhere
else.

**Desktop — left rail, 6 items:** `Home` · `Accounts` · `Insights` · `Goals` · `Household` ·
`Settings`, plus a persistent top bar (lens switcher, global search / quick-add via
`⌘K`/`Ctrl K`, sync status, theme toggle, account menu). Household is promoted to the rail on
desktop because laptop sessions are disproportionately "sit down once a month and reconcile
everything" sessions, where ownership edits happen; phone sessions are disproportionately
quick checks. A 6-item rail costs nothing on desktop the way a 5th thumb-reach costs on
mobile — there is no equivalent width constraint, so the rail simply grows with the product.

```
┌───┬─────────────────────────────────────────────────────────┐
│ N │  [Me | Household | Priya]        ⌕ Search/Add  ⏱ Synced │
│ e │───────────────────────────────────────────────────────── │
│ t │                                                           │
│ W │                    (dense screen content)                │
│ o │                                                           │
│ r │                                                           │
│ t │                                                           │
│ h │                                                           │
├───┤                                                           │
│⌂  │  Home                                                     │
│▤  │  Accounts                                                 │
│📈 │  Insights                                                 │
│◎  │  Goals                                                    │
│⚭  │  Household                                                │
│⚙  │  Settings                                                 │
└───┴───────────────────────────────────────────────────────────┘
```

### 1.2 Sitemap

```
Unlock (gate, not in nav)
 └─ Home ──────────────┬─ Net Worth Detail (timeline, drill-down)
                        ├─ [Account group] → Account Detail → Edit
                        └─ [Nudge cards] → Goals / Accounts / Unallocated filter
 Accounts ─────────────┬─ Account Detail → Edit / Delete / Duplicate
                        └─ Add flow (sheet/dialog, overlays any tab)
 Insights ─────────────┬─ This year (waterfall, XIRR, drift, liquidity, concentration,
                        │  loan burn-down, movers, data hygiene, milestone)
                        └─ Forecast (fan chart, scenario lab, FI, goal odds, sensitivity,
                           assumptions) — a sub-tab inside the same screen, not a new tab
 Goals ────────────────┬─ Goal Detail → Edit goal / Allocation editor
                        └─ Add goal
 More (mobile) ────────┬─ Household & Sharing → Invite member / Edit shares
      / rail (desktop) ├─ Settings → Security · Appearance · Data · About
                        └─ Lock now
```

---

## 2. Global concepts

### 2.1 Ownership lens

A `ToggleGroup` segmented control: **Me · Household · [Spouse]**. (With >2 adult members it
scrolls horizontally; the common case is 2, so design for a 2–3-wide control, not a dropdown —
a dropdown would hide the thing we most want visible.)

- **Me** — every figure is share-weighted: 50% of the joint account, 60% of the flat, 100% of
  your own EPF, 0% of your spouse's PPF.
- **Household** — full value of everything, all members, no weighting.
- **[Named member]** — the same share-weighted math from that member's side. Tapping a
  member's avatar anywhere (account row, goal funding list) jumps the lens to them — a
  shortcut, not a separate feature.

Switching lens **re-computes in place**: numbers animate with a brief count-up/count-down
(150ms, disabled under `prefers-reduced-motion`) rather than a page reload or skeleton flash,
because the data doesn't change — only the arithmetic does, and that should feel instant.

Every row that isn't 100% owned by the current lens carries a small ownership badge —
`◐ 50/50 with Priya` — so a joint account never silently reads as if it were fully yours.
This is the detail that makes the lens trustworthy: you can always see *why* a number is what
it is without leaving the list.

### 2.2 Goal allocation & Unallocated

Two visual primitives, used everywhere money meets goals:

- **On a holding/account row:** a thin allocation strip under the value —
  `▓▓▓▓▓▓░░░░ 60% Retirement · 40% Unallocated` — segments coloured by goal (goal colours are
  user-assigned from the categorical palette, distinct per goal, not tied to asset-type
  colours). Tapping opens the allocation editor.
- **On a goal:** a meter (single ratio, same-hue track — see §7.4) showing current vs.
  inflated target, plus the funding holdings list underneath so "why is this at 62%" is always
  one tap away, never a mystery aggregate.

**Unallocated** is never hidden. Home surfaces it as a nudge card whenever it exceeds a
meaningful share of net worth ("₹10.4L is unallocated — tag it to a goal"); Goals list shows
it as a real row at the bottom, styled like a goal but in muted ink, tappable straight into a
bulk-tagging view (a filtered Accounts list scoped to untagged money, each row with an inline
"tag to…" combobox — the fastest path to zero unallocated).

**Allocation editor** (opened from the strip or from an account/holding's detail): one row per
goal already tagged, each a labelled slider (0–100%, or a fixed-amount toggle for "always keep
₹5L of this FD for Emergency Fund regardless of balance changes"), plus an "Add goal tag"
combobox. A live remainder chip (`Unallocated: 12%`) sits at the bottom and turns from muted to
an amber outline if it's not intentional — i.e., if the user has tagged goals before on this
same account type (auto-tag rule available) but left this one partially bare.

### 2.3 Sync, offline & staleness — honest states, always visible

A single status affordance lives in the top bar (desktop) / a thin banner that appears only
when not in the default state (mobile, to avoid permanent chrome tax on a small screen):

| State | Mobile | Desktop top bar | Meaning shown |
|---|---|---|---|
| Synced | *(no banner)* | `⏱ Synced 2 min ago` (muted) | default, invisible when nothing to report |
| Syncing | thin top progress hairline | `⟳ Syncing…` | background push/pull in flight |
| Offline | banner: `You're offline — changes save locally` | `⚡ Offline · will sync` | Info tone, not alarm — offline is a supported state, not an error |
| Sync conflict (rare) | banner with "Review" action | badge on sync icon | 409 → re-pull → merge happened automatically; only surfaced if it touched a value the user is currently viewing |

Price staleness is per-instrument, not global: any market-priced figure (MF NAV, stock,
crypto, gold rate) carries a small `as of 8 Sep` caption wherever its value appears (row,
detail, chart tooltip). If the last price fetch is >36h old (e.g., the price service is down),
that caption switches to a warning tone — `⚠ price stale · as of 5 Sep` — still text+icon,
never colour alone, and never a fabricated "live" figure in between fetches.

---

## 3. Core screens

Each screen below: purpose, layout, hierarchy, key components, and empty/loading/error states.
Visual detail (colour, spacing, exact type) is in §7; see it rendered with real data in
`docs/ux/prototype.html`.

### 3.1 Unlock

**Purpose:** gate every session; set the tone ("private, calm, competent") before any data is
visible.

**Layout (mobile, full-bleed):**
```
┌───────────────────────────┐
│                           │
│           (mark)           │
│      NetWorth Tracker      │
│                           │
│   Sharma Household         │
│                           │
│   [ 🫆  Unlock with Face ID ]  ← primary, biometric/passkey
│                           │
│   Use passphrase instead   ← text link, secondary path
│                           │
│  ──────────────────────   │
│  Encrypted on this device. │
│  We can never see your     │
│  data.                     │
└───────────────────────────┘
```
- Passphrase fallback expands **in place** into a password field + "Unlock" button — never a
  separate screen; losing the biometric prompt shouldn't cost navigation.
- Reassurance line is permanent chrome, not a dismissible tooltip — privacy is asserted every
  single unlock, quietly, in muted ink, not a scary modal.
- **Loading:** button becomes a spinner + "Unlocking…"; the Argon2id derivation is
  CPU-deliberate (by design, §Security) and can take ~1s on a phone — never let that read as a
  frozen tap.
- **Error:** passphrase field gets an inline red-bordered state **and** a text message below
  it ("That passphrase didn't work — try again, or use your recovery kit"); a wrong biometric
  falls back to the passphrase field automatically after 2 failed attempts, no separate error
  screen.
- **Empty/edge state:** first-ever unlock on a new device (no local cache yet) shows a one-line
  "Setting up your household…" progress state while the initial sync pulls all records — this
  is the only screen in the app allowed a full-screen loading state, because there is
  genuinely nothing else to show yet.

### 3.2 Home (Dashboard)

**Purpose:** answer "what's my number and is anything wrong" in one unscrolled screen.

**Layout (mobile):**
```
┌───────────────────────────┐
│ [Me | Household | Priya]  │ ← sticky lens bar
│───────────────────────────│
│  Household net worth       │
│  ₹1,92,95,300               │ ← hero figure, 36px
│  ▲ +₹1,79,000 this month    │ ← delta, icon+sign+colour
│  ┈┈┈┈┈┈┈┈╱‾‾╲┈┈┈┈┈┈╱       │ ← 12-mo sparkline, tap → Net Worth Detail
│───────────────────────────│
│  Net worth by type          │
│  ▓▓▓▓▓▓░░░▓░░▓░ (stacked)   │ ← horizontal composition bar, tap → Accounts filtered
│  Cash & bank · MFs · Property│  (legend beneath, 2 lines wrap)
│───────────────────────────│
│  ⚠ Nudges (0–3 cards)       │
│  · ₹10.4L unallocated       │
│  · Education goal at risk   │
│  · Gold price 2 days stale  │
│───────────────────────────│
│  Goals             See all →│
│  [Retirement 61%] [Educ 25%]│ ← horizontal card carousel, swipeable
└───────────────────────────┘
        Home  Accts  Goals  More
              (FAB +)
```
- **Hierarchy:** hero number > delta > trend > composition > nudges > goals preview. Nudges
  are capped at 3, most-important first (unallocated > at-risk goal > stale price), so a good
  month can show zero nudge cards and just feel calm.
- **Key components:** hero stat tile, sparkline (Recharts `AreaChart`, single series, sequential
  blue wash), horizontal stacked composition bar, nudge `Alert` cards, goal `Card` carousel.
- **Loading:** skeleton hero (grey bar), skeleton composition bar, skeleton goal cards — never
  a spinner over the whole screen; the shell (lens bar, tab bar) renders instantly from cached
  data even before decryption/valuation finishes.
- **Empty (new household, nothing added yet):** hero replaced with a friendly zero-state —
  "Your household net worth will show up here" + a prominent "Add your first account" button
  (not just the FAB — first-run deserves an explicit CTA) — nudges and goals sections hidden
  entirely rather than shown empty.
- **Error (decryption/valuation failure — should be rare):** hero tile becomes an inline
  `Alert`: "Couldn't compute net worth — [Retry]", rest of screen still renders whatever did
  load; never a full-screen crash page for a partial failure.

**Desktop Home** keeps the same hierarchy but goes wide: hero + sparkline + composition bar
share a 3-column top row; nudges become a right-hand rail; goals become a 3-up card row below
— more visible at once, same story, no re-derivation of content.

### 3.3 Net Worth Detail & Timeline

**Purpose:** the "scrub back through history" promise — full trend, comparable across lenses
and time ranges.

**Layout:** full-bleed line chart (single series in the active lens's tint; switching lens
re-colours and re-plots, doesn't navigate away) with a range selector (`1M 3M 1Y All`) as a row
of pill buttons above it, a scrub/crosshair on drag showing a tooltip (date, value, day change),
and below the chart: the same composition breakdown as Home but now with a toggle between
**By asset type** and **By member** (a second categorical breakdown using the same 8-slot
palette, member-keyed instead of type-keyed — never both encodings in one chart at once).

- A **"Compare members"** toggle overlays up to 2 additional lines (You / Priya / Household) —
  capped at 3 total series, each direct-labelled at the line's right end (per §7 chart rules);
  past 3 the toggle disables the option it would violate.
- **Loading:** chart area shows a skeleton line + skeleton pills; never block the range
  selector itself.
- **Empty:** fewer than 2 data points (brand-new household) — replace the chart with "Your
  timeline starts once you've had two check-ins" and keep the composition breakdown, which
  needs only one point in time.
- A persistent **"View as table"** link under the chart opens the same series as a plain data
  table — the accessibility/relief channel required whenever a chart carries the only copy of
  a number (see §8).

### 3.4 Accounts (list)

**Purpose:** the working inventory — every asset and liability, fast to scan, fast to edit.

**Layout (mobile):** grouped list, one section per schema-level category (Cash & Bank,
Deposits, Investments, Retirement & Small Savings, Foreign, Property & Valuables, Insurance,
Lending, Loans & Debts owed), each section collapsible, each row. Note this is a *finer* split
than the 7-bucket picker in §4.1: the add-flow groups by mental model for entry speed
(receivables and liabilities share one bucket, "who owes whom"), while the list groups by
schema type for precise scanning once things exist — same data, two taxonomies, each earning
its keep at a different moment:
```
🏦  HDFC Joint Savings         ◐ 50/50 · Priya
    ₹8,42,300                 ▓▓▓░░░░░░░ 40% tagged
```
Swipe-left on a row reveals `Edit` / `Update value` / `Delete` (mobile gesture, §8). A search
field pinned at the top filters across all sections instantly (client-side, the whole dataset
already lives decrypted in memory).

**Desktop:** a genuinely dense `Table` (shadcn `Table` + sortable headers), one row per record,
columns: Name, Institution, Owner(s), Value, Allocation, As-of, and a hover-revealed row-action
menu — no card padding, no swipe gestures; keyboard `j`/`k` to move selection, `Enter` to open,
`e` to edit inline. This is the screen where "dense keyboard-friendly desktop view" matters
most — a household with 20+ records should be scannable in one screen height on a laptop.

- **Loading:** skeleton rows, grouped headers render immediately (they're structural, not
  data-dependent).
- **Empty (a whole category with nothing in it):** the section header still shows (so the user
  learns the taxonomy exists) with a muted "Nothing here yet — Add" inline link, not hidden.
- **Empty (whole list, new household):** replaced by the same first-run CTA as Home.
- **Error (one record fails to decrypt/value — corrupt local cache entry):** that single row
  renders as a red-outlined placeholder ("Couldn't load this record — [Retry] [Remove]"); it
  never blocks the rest of the list from rendering.

### 3.5 Add / Edit flow — "Add anything"

Its own deep-dive is §4; screen mechanics here.

**Entry points:** FAB (Home/Accounts/Goals), `+` in desktop top bar, or `⌘K`-style quick-add
command palette on desktop (`Command` component — typing "SBI FD" jumps straight to the Fixed
Deposit form pre-filled with "SBI" as institution).

**Mobile:** a bottom `Sheet` that grows through steps (category → type → form) without ever
fully leaving the current screen's context behind it (a dimmed scrim keeps Home/Accounts
visible and swipe-down-to-dismiss always available). **Desktop:** a centered `Dialog`, same
step content, wide enough for the form's fields to sit two-per-row.

- **Loading:** none needed for steps 1–2 (pure local UI); step 3's institution-autocomplete
  list is instant (bundled static list, no network per §Security "no per-symbol queries" —
  this list is generic Indian banks/AMCs, not the user's holdings).
- **Empty:** the category search box, when it matches nothing ("platypus fund"), shows "No
  match — browse categories below" and keeps the grid visible rather than a dead-end blank.
- **Error:** inline field-level validation only (e.g., ownership shares not summing to 100% —
  shown as a live remainder chip that turns from muted to a warning state, not a submit-time
  wall of red); Save is disabled while the sum is invalid, with the remainder chip explaining
  why.

### 3.6 Goals (list)

**Layout (mobile):** header stat row ("₹61.4L earmarked of ₹1.93Cr net worth"), then one `Card`
per goal:
```
┌───────────────────────────┐
│ 🎓 Ananya's Education       │
│ ⚠ At risk                   │
│ ▓░░░░░░░░░░░░░░░░ 3%        │
│ ₹4.78L of ₹1.90Cr (2040)     │
│ Needs ₹42,300/mo · has ₹9,000│
└───────────────────────────┘
```
plus the **Unallocated** row at the bottom, visually a goal-shaped card in muted/dashed style
so it reads as "not yet a goal" rather than "a goal named Unallocated."

- Status badge is always icon + word (`✓ On track` / `⚠ At risk` / `✕ Off track`) using the
  fixed status palette (§7.2) — colour reinforces, never carries the meaning alone.
- **Desktop:** the same cards in a 3-up grid; add-goal button top-right instead of a FAB.
- **Loading:** skeleton cards (badge omitted, everything else greyed).
- **Empty:** "No goals yet — money you haven't earmarked will show as Unallocated" + prominent
  "Add a goal" CTA; still show the Unallocated summary if there's any net worth at all, since
  that's true and useful even with zero goals defined.

### 3.7 Goal Detail

**Layout:** meter (current vs. inflated target) at top, then a stat row (shortfall, required
monthly SIP, target date, priority), then **funding holdings** — the literal list of accounts
tagged to this goal with their tagged amount/%, each tappable back to Account Detail — then any
**suitability warnings** as `Alert`s (e.g., *"SBI FD (matures Dec 2027) funds part of this goal,
but your target date is Nov 2026 — consider a more liquid instrument"*), then a projection note
in plain language ("At ₹9,000/mo you'll reach about ₹56.6L by 2040 — ₹1.33Cr short of the
₹1.90Cr target. Raising the SIP to ₹42,300/mo closes the gap.").

- Edit affordances: change target/date/inflation/return assumptions (a form, same shape as
  add-asset's form skeleton); "Manage allocations" jumps into the allocation editor pre-scoped
  to this goal, letting the user add more funding sources from here instead of hunting through
  Accounts.
- **Loading:** skeleton meter + stat row; funding list skeleton rows.
- **Empty (goal with nothing tagged yet):** meter shows 0%, funding list replaced by "Nothing
  funding this goal yet — tag an account" with a shortcut into the allocation picker filtered
  to Unallocated money first (the obvious source).
- **Error:** if the projection math can't run (e.g., expected return is 0 or target date is in
  the past), an inline `Alert` explains what's wrong in the assumptions rather than showing
  `NaN` or a silently wrong number — a numeric project like this must never render garbage.

### 3.8 Household & Sharing

**Purpose:** make ownership and E2EE sharing legible and low-anxiety — this is where trust is
either earned or lost.

**Layout:** household name + member list, each member a row with avatar/initials, name, role
(Owner/Member), and a **key status** chip (`🔑 Has access` / `⏳ Invite pending`); below that,
an **ownership overview** — every joint record (any asset with >1 owner) listed with its split,
editable inline (a slider or two linked percentage fields that always sum to 100, matching the
control used in the add flow — one control, reused everywhere ownership appears); an **"Invite
member"** CTA that explains in one line what happens technically without jargon: *"Priya will
be able to unlock and see this household's data on her own device."*

- **Loading:** skeleton member rows.
- **Empty (solo household, no spouse invited yet):** single member row + a friendly "Add your
  spouse or family member to share this household" prompt — framed as a feature, not a
  missing-setup nag.
- **Error (invite failed / expired):** inline on that member's row (`⚠ Invite expired — [Resend]`),
  never a global banner for a single failed invite.

### 3.9 Settings

**Layout:** grouped list (shadcn `Accordion` or simple sectioned list, not tabs — settings is a
scan-then-tap pattern, not a multi-pane workspace): **Security** (change passphrase, view/print
recovery kit, biometric unlock toggle, auto-lock timer select), **Appearance** (theme:
Light/Dark/System), **Data** (export encrypted backup, "Import from CAS/statement — coming
soon" shown but disabled, clearly labelled as future rather than omitted so the user knows it's
planned), **About** (household name, app version, links to the security/threat-model summary in
plain language), and a standalone **Lock now** action pinned at the bottom, always one tap away
— a privacy app should make "lock immediately" trivially discoverable, not buried three menus
deep.

- No loading/empty states of note (all static/local); **error** only applies to Data actions
  (export failure) shown as an inline `Alert` on that row.

### 3.10 Insights — "This year"

**Purpose:** answer the question v1 left on the table — *why* did my number move, not just
*that* it moved. Added after owner review asked for "much better insight into net worth."
Full methodology (every formula, every reconciliation) is in §11 — this entry covers layout.

**Layout:** a screen-level segmented control — **This year | Forecast** (§3.11) — sits under
the header; both panels live on one screen (state, not navigation, per the same principle that
governs the ownership lens). "This year" is the default panel and a scrollable stack of
`insight-card`s, richest-first:

1. **Contribution vs. growth** (the hero, per owner instruction) — a single horizontal
   `stacked bar` (12 months ago → what you added → what the market did = today), with the two
   moving segments' exact rupee breakdown underneath as two short lists. This is deliberately
   the first card and the only one with the reassurance-earning "hero" treatment (Principle 1's
   logic applied to *this* screen: the one number that matters leads).
2. **Money-weighted returns (XIRR)** — a short list, portfolio → equity MF → US RSU, plus the
   EPF/PPF/NPS/SSY *declared rate* shown in the same list but visually distinct (no `xirr-val`
   colour) — a solved return and a declared rate are different kinds of number and must not
   look identical.
3. **Nominal vs. real growth** — a compact stat block (not yet the chart itself) with a
   `foot-note`-style CTA into the timeline (§3.3), which is where the actual second line lives,
   per the brief's own placement instruction.
4. **Asset allocation vs. target** — one `diverging bar` per category (§6.3's diverging
   treatment, reused for a new job: policy drift, not assets-vs-liabilities), plus one
   plain-language nudge sentence naming the single worst-drifted category.
5. **Liquidity ladder** — one ordinal `stacked bar` (§6.3.1) plus a legend list; closes the
   loop on the Emergency Fund's liquidity-mismatch story from §3.7 by showing the *shape* of
   liquidity across the whole household, not just one goal.
6. **Concentration risk** — two headline stats (employer exposure, single-stock exposure) plus
   a ranked single-hue bar list by institution.
7. **Home loan burn-down** — a 2-segment `stacked bar` (principal repaid vs. interest paid to
   date) plus payoff-date and rate context. No prepayment control here — that lives in Forecast,
   because "what if I prepay" is a forward question, not a status report.
8. **What changed this month** — a signed, sorted list (both directions), reusing the delta
   convention from §10 (icon + sign + colour, never colour alone).
9. **Data hygiene** — a list of manually-tracked values old enough to drag on trust, worst
   first (in the reference data, the flat's 5-month-old valuation — 70% of net worth priced off
   a stale manual estimate — outranks the 2-day-old gold price feed lag).
10. **Milestone** — next round-number stat tile with a meter and a doubling-time caveat that is
    explicit about *what* is doubling (last year's overall pace, including new savings — not a
    pure investment return, and the copy says so, per Principle 6).

- **Loading:** skeleton cards in the same order; nothing here is latency-sensitive in the real
  app (all inputs are already-decrypted local data), so this mostly matters for slow devices.
- **Empty (new household, <2 months of history):** cards that need a trailing-12-month window
  (waterfall, XIRR, movers, real-vs-nominal) collapse to "Come back once you've had a few
  check-ins" states; cards that only need a snapshot (drift, liquidity, concentration, loan
  burn-down, data hygiene) still render normally — a new household has no *history* but does
  have a *shape*, and the screen should show what it honestly can.
- **Error:** identical pattern to Home (§3.2) — an inline `Alert` on the one card that failed,
  never a blank screen for a partial computation failure.

### 3.11 Insights — "Forecast"

**Purpose:** the predictability half of the brief — not a single-number prophecy, but a
legible range, driven by assumptions the owner can see and change. Full methodology in §12.

**Layout:** the second panel behind the same segmented control as §3.10.

1. **Net worth projection** — a **fan chart** (§6.3.2): the actual trailing line flows straight
   into a P50 midpoint line, with a soft P10–P90 band around it, one horizon selector (`1Y 3Y
   5Y 10Y 20Y`) above it. This is the screen's hero, mirroring the waterfall's position on the
   other panel — per the brief, **never a single line**.
2. **Scenario lab** — sliders and toggles (extra SIP, salary hike, market crash, income gap, a
   second-property purchase, a college withdrawal) that redraw the fan chart *in place* on every
   change, plus a standalone "prepay vs. invest" comparison driven by one shared lump-sum
   slider. The comparison deliberately renders two numbers side by side and declares no winner
   in copy — Principle 6 (calm, not gamified) applies as much to a neutral financial trade-off
   as it does to avoiding streaks.
3. **Financial independence** — a two-stat grid (corpus needed, projected FI year) plus a
   coast-FI verdict sentence, both driven by two sliders (annual expenses, safe withdrawal
   rate) that recompute live.
4. **Odds of funding each goal** — reuses the Goals data model (§3.7) and expresses each goal's
   likelihood of reaching its inflated target as a rough probability with the underlying P10 /
   P50 / P90 corpus shown beneath it — explicitly labelled a heuristic (§12.5), not a real
   distribution. The Education goal additionally shows the odds *at the required SIP*, so the
   fix is visible next to the problem.
5. **Sensitivity** — a ranked single-hue bar list: which single assumption, bumped by one
   point, moves the 10-year number the most. In the reference household this is the property
   return assumption by a wide margin, itself a direct, honest consequence of the allocation
   drift surfaced in §3.10 — the two cards are meant to be read together.
6. **Assumptions** — every return assumption used above, shown as **editable inline number
   inputs**, plus the inflation rate. Per the brief: *assumptions are visible and editable
   inline, never buried, and every projection is labelled an estimate.* Editing a return
   assumption here changes the fan chart and FI numbers immediately; it does not retroactively
   recompute goal odds or sensitivity in this prototype (documented as a known simplification —
   §12.7).

- **Loading:** the fan chart holds its previous render at reduced opacity while recomputing
  (per `interaction.md`'s refetch rule) rather than flashing a skeleton on every slider move.
- **Empty:** none — a projection only needs today's snapshot plus assumptions, both of which
  always exist.
- **Error:** the editable assumption inputs are clamped to a plausible band (prototype: a
  shared ±20/30% for every category — real implementation should clamp per asset class, not
  share one band) specifically so a mistyped extreme value can never reach the monthly-rate
  math and produce `NaN` downstream. Preventing the bad state beats detecting it after the
  fact, and matches the same non-negotiable as Goal Detail's projection math in §3.7: a
  numeric projection must never render garbage.

---

## 4. The "Add anything" flow — collapsing 20 types into one shape

This is the hardest UX problem in the brief. The approach: **one form skeleton, three levels
of progressive disclosure, and a small fixed set of category buckets that match how an Indian
household actually thinks about its money** — not the schema's internal taxonomy.

### 4.1 Seven buckets, not twenty types

The schema has ~20 record types; the picker never shows more than 7 tiles at once:

| Bucket (tile shown) | Types it expands to |
|---|---|
| **Cash & Bank** | Savings, current, joint account, cash in hand, UPI/wallet balance |
| **Deposits** | Fixed deposit, recurring deposit, corporate FD, post-office TD/MIS |
| **Investments** | Mutual fund, Indian stocks, ETF, bonds, SGB, US stocks, RSU/ESPP, crypto, digital gold |
| **Retirement & Small Savings** | EPF, PPF, VPF, NPS (T1/T2), Sukanya Samriddhi, NSC, KVP, SCSS |
| **Property & Valuables** | Real estate, vehicle, physical gold/jewellery, other valuables |
| **Insurance** | Endowment/money-back/ULIP (surrender value), term (₹0 asset, tracked for cover) |
| **Lending & Loans** | Money lent to family/friends, security deposits, chit funds — **and**, same bucket, the liability side: home/car/personal loan, credit card, borrowed from family |

Lending & Loans deliberately merges receivables and liabilities into one bucket at the top
level — "money owed" is one mental category for most people ("who owes whom"), split into
*Owed to me* vs. *I owe* as the very next tap, rather than forcing the user to first decide
"is this an asset or a liability" before they've even named the thing.

**Why 7 and not fewer/more.** Seven sits at the top of comfortable single-glance tile counts
(a 2-column or 3-column grid, 3–4 rows) and maps to natural categories a non-technical spouse
already has words for. Going to 20 flat items fails the "not an intimidating form maze"
requirement outright; going to 3–4 mega-buckets (e.g., merging Investments and Retirement)
would blur two things people budget very differently (liquid growth money vs. locked
long-horizon money) and that distinction matters enough to the app's own goal logic (auto-tag
rules, suitability warnings) to deserve its own tile.

**Frequency shortcuts, always above the grid:** a "Frequently added" row (recency + count,
computed locally, never synced) surfaces the 3 types this household actually uses most —
after the first few sessions, most repeat entries (updating an FD, adding a new SIP folio)
never touch the category grid at all.

### 4.2 The three steps

```
Step 1: What is it?          Step 2: Which one?              Step 3: Tell us about it
┌─────────────────┐         ┌─────────────────┐             ┌─────────────────────┐
│ 🔎 Search…        │         │ ← Investments     │             │ ← Mutual Fund          │
│                  │         │                  │             │                      │
│ Frequently added: │         │ ○ Mutual fund     │             │ Scheme/folio name     │
│ [MF] [FD] [SIP]   │         │ ○ Indian stocks   │             │ [___________]        │
│                  │         │ ○ ETF             │             │                      │
│ 🏦 Cash & Bank    │         │ ○ US stocks       │             │ AMC/broker            │
│ 💰 Deposits       │         │ ○ RSU / ESPP      │             │ [combobox_______]    │
│ 📈 Investments    │         │ ○ Crypto          │             │                      │
│ 🏛 Retirement      │         │ ○ Digital gold    │             │ Current value  ₹     │
│ 🏠 Property        │         │ ○ Bonds / SGB     │             │ [___________]        │
│ 🛡 Insurance       │         │                  │             │                      │
│ 🤝 Lending & Loans │         │                  │             │ As of  [today ▾]      │
│                  │         │                  │             │                      │
│                  │         │                  │             │ Owned by  Just me ▾   │
│                  │         │                  │             │                      │
│                  │         │                  │             │ Tag to goal (optional)│
│                  │         │                  │             │ [+ Retirement]        │
│                  │         │                  │             │                      │
│                  │         │                  │             │ ▸ Notes (optional)     │
│                  │         │                  │             │                      │
│                  │         │                  │             │ [ Save ] [Save & add another] │
└─────────────────┘         └─────────────────┘             └─────────────────────┘
```

**Step 3 is always the same 6-field skeleton** — Name, Institution, Value, As-of date, Owned
by, Tag to goal, (collapsed) Notes — with **0–3 type-specific fields** inserted directly below
Value, never elsewhere, so the eye always knows where "the normal stuff" ends and "the specific
stuff" begins:

| Type example | Extra fields inserted |
|---|---|
| Fixed Deposit | Maturity date, interest rate, auto-renew (switch) |
| Real estate | Address, linked liability (combobox of existing loans, or "add one now") |
| RSU/ESPP | Vesting start, schedule (quarterly/annual), unvested units (excluded from net worth by default, shown separately) |
| Money lent | Borrower name, expected return date, interest (or "interest-free" switch) |
| Loan/liability | Outstanding amount, EMI, tenure remaining |
| Insurance (term) | Sum assured (tracked, contributes ₹0 to net worth — labelled explicitly so it isn't mistaken for a missing value) |

**Owned by** defaults to "Just me" (zero extra taps for the common case) and expands inline
into the shared ownership-split control (§2.1's badge, editable) only when tapped — joint
accounts cost exactly one extra tap, not a detour.

**"Save & add another"** is a first-class secondary action, not an afterthought — reflecting
that the #1 adoption risk named in the brief is entry speed, and a session where someone digs
out three FD passbooks at once should never re-walk the category grid three times. It returns
to Step 1 with the same bucket pre-opened (most batches are same-type).

---

## 5. Component inventory → shadcn/ui

| UI element | shadcn/ui primitive(s) |
|---|---|
| Lens switcher, chart range pills, By type/By member toggle | `ToggleGroup` |
| Bottom sheet (mobile add/edit, allocation editor, filters) | `Sheet` |
| Desktop add/edit, confirmations, shortcut cheatsheet | `Dialog` |
| Hero stat tile, goal card, account group card | `Card` |
| Status / ownership / staleness / tag badges | `Badge` |
| Member initials, joint-owner stacks | `Avatar`, `AvatarGroup` pattern (stacked `Avatar`s) |
| Goal meter, onboarding/sync progress | `Progress` |
| Global search + quick-add (desktop) | `Command` (cmdk) |
| Info popovers, date pickers trigger | `Popover` + `Calendar` |
| Institution picker, goal multi-tag | `Combobox` (Command inside Popover) |
| Ownership split, allocation %s | `Slider` (paired, linked to sum to 100) |
| Biometric/auto-lock/include-in-net-worth toggles | `Switch` |
| Notes / advanced fields | `Accordion` |
| Save confirmations, sync toasts | `Sonner` (toast) |
| Suitability warnings, offline/stale banners | `Alert` |
| Row quick actions (desktop hover, mobile swipe reveal) | `DropdownMenu` |
| Loading placeholders (hero, rows, chart) | `Skeleton` |
| List section dividers | `Separator` |
| Bottom sheet / table horizontal scroll | `ScrollArea` |
| Dense desktop accounts list | `Table` (+ sortable headers, no external table lib needed at v1 scale) |
| Category/type picker grid & list | `Tabs` is *not* used here (see §1 rationale on lens vs nav) — plain `Button` grid + `Command` for search-first filtering |
| Charts | `Recharts` — `AreaChart` (net worth trend), horizontal stacked `BarChart` (composition), no pie/donut (see §6.3) |
| This year / Forecast sub-screen switch | `ToggleGroup` — same primitive as the lens switcher, same rule: state within a screen, not a route |
| Contribution/growth bridge, principal/interest split | Horizontal stacked `BarChart` (Recharts) — same component as composition, different data, per `marks-and-anatomy.md`'s "part-to-whole rides on the stacked bar" |
| Liquidity ladder | Horizontal stacked `BarChart` with an **ordinal** single-hue scale, not the categorical one (§6.3.1) |
| Allocation drift, sensitivity ranking | Recharts `BarChart` — diverging (drift, §6.3.3) or single-hue ranked (sensitivity) |
| Net worth fan chart (P10–P90) | Recharts `AreaChart` (band) + `Line` (P50), one shared axis (§6.3.2) — **not** two overlaid chart components with independent scales |
| Scenario sliders (SIP, salary hike, lump sum, expenses, withdrawal rate) | `Slider` |
| Scenario toggles (crash, income gap, buy a house, college withdrawal) | `Switch` |
| Editable assumption inputs | native numeric `Input`, each with `min`/`max` clamps per asset class (see §3.11's error-state note) |
| Per-goal probability, sensitivity, XIRR rows | plain list rows (no chart) — a handful of headline numbers is a KPI row, not a chart, per `choosing-a-form.md` |

---

## 6. Design tokens — colour

Palette selection followed the project's data-viz method (four colour jobs: categorical /
sequential / diverging / status, each with fixed rules) rather than hand-picked hex values;
every categorical/status value below is validated for lightness band, chroma, contrast, and
CVD separation (Deuteranopia/Protanopia, OKLab ΔE ≥ 8 target / ≥15 normal-vision floor).

### 6.1 Semantic UI roles (chrome, not data)

| Role | Light | Dark |
|---|---|---|
| Page background | `#f9f9f7` | `#0d0d0d` |
| Surface (card/sheet/dialog) | `#fcfcfb` | `#1a1a19` |
| Surface — sunken (inputs, table stripe) | `#f2f1ee` | `#242423` |
| Border / hairline | `rgba(11,11,11,0.10)` | `rgba(255,255,255,0.10)` |
| Text — primary | `#0b0b0b` | `#ffffff` |
| Text — secondary | `#52514e` | `#c3c2b7` |
| Text — muted (captions, "as of") | `#898781` | `#898781` |
| Accent (brand, primary actions, active lens segment) | `#2a78d6` | `#3987e5` |
| Focus ring | `#2a78d6` @ 2px offset ring | `#3987e5` @ 2px offset ring |

Flat design over heavy elevation: cards and rows are separated by hairline borders, not
drop shadows, in both themes — shadows read inconsistently on dark surfaces and add visual
noise this app's calm tone doesn't want. Reserve real shadow for genuinely floating elements:
FAB, open Sheet/Dialog, open DropdownMenu, Toast.

### 6.2 Status palette (fixed, never restyled per-theme beyond dark-step, always icon+label)

| Status | Used for | Hex (light) | Hex (dark) | Icon |
|---|---|---|---|---|
| Good | On-track goal, positive delta | `#0ca30c` (delta text: `#006300` light) | `#0ca30c` | ✓ / ▲ |
| Warning | At-risk goal, stale price (>36h) | `#fab219` | `#fab219` | ⚠ |
| Serious | *(reserved — not used at v1 scope)* | `#ec835a` | `#ec835a` | — |
| Critical | Off-track goal, negative delta, liability emphasis | `#d03b3b` | `#d03b3b` | ✕ / ▼ |

**Rule, restated because it's a hard product requirement:** no status, gain/loss, or
on-track/at-risk/off-track meaning is ever conveyed by colour alone. Every instance pairs the
colour with an icon (✓ ⚠ ✕, ▲ ▼) and a text word ("On track", "+₹12,450"). A colourblind or
greyscale-display user reads the identical information.

### 6.3 Chart palette

- **Net worth composition (asset types), part-to-whole:** the 8-slot categorical order from
  the validated default palette, in this **fixed** assignment (fixed by entity, never
  re-ordered by value/rank):

  | Slot | Hue | Category |
  |---|---|---|
  | 1 | blue `#2a78d6` / `#3987e5` | Cash & Bank |
  | 2 | orange `#eb6834` / `#d95926` | Deposits |
  | 3 | aqua `#1baf7a` / `#199e70` | Investments |
  | 4 | yellow `#eda100` / `#c98500` | Retirement & Small Savings |
  | 5 | magenta `#e87ba4` / `#d55181` | Foreign (US stocks/RSU) & Crypto |
  | 6 | green `#008300` (both modes) | Property & Valuables |
  | 7 | violet `#4a3aa7` / `#9085e9` | Insurance & Lending |
  | *(8, red)* | *unused for asset composition* | reserved so it never sits next to status-critical in the same chart |

  Rendered as a **horizontal stacked bar**, not a pie/donut — better for long category labels,
  better for mobile width, and it composes with a below-the-fold legend list that carries the
  actual rupee amounts (the chart shows proportion; the list carries precision — see
  `marks-and-anatomy.md`'s "text never wears the data color" rule, applied by putting amounts
  in plain text next to a colour swatch, never colouring the number itself).
- **Net worth trend (single series):** sequential blue wash (`AreaChart`, ~10% fill opacity,
  2px line), matches the accent colour so "the number that matters" and "the brand" are the
  same hue — reserve orange (slot 2) as the second line's colour if "Compare members" is active
  for a second series, violet (slot 7) for a third; direct-labelled at line end, capped at 3
  total per §"choosing a form" series ladder. The **real (inflation-adjusted)** overlay (§11.3)
  reuses slot 3 (aqua) and is the one legitimate use of a **dashed** stroke on a data series in
  this app — not a gridline, so the anti-pattern doesn't apply, and dashing is the conventional,
  correctly-read signal for "adjusted," distinct from "actual." Never combine the real overlay
  and the compare-members lines in the same render (§"choosing a form"'s 3-series cap, and two
  reasons to add a line is one too many).
- **Assets vs. Liabilities**, if a future screen needs the literal A − L framing (not yet
  built): the diverging pair, blue (assets) ↔ red `#e34948`/`#e66767` (liabilities), neutral
  grey midpoint — reserved for that specific polarity, not spent on anything else.
- **Goal meters:** fill in the accent hue (or the goal's own assigned categorical colour once a
  household has enough goals to need distinguishing at a glance), unfilled track a lighter step
  of the same ramp — never grey-vs-colour, which reads as "broken" rather than "unfilled."

#### 6.3.1 Liquidity ladder — an ordinal ramp, not categorical

Liquidity tiers are **ordinal** (swapping "reachable today" and "illiquid" changes the
meaning), so they take the one-hue, monotone-lightness ramp per `color-formula.md`, not the
8-slot categorical set — reusing categorical colour here would wrongly imply the tiers are
independent identities rather than a single ordered spectrum. Validated with
`--ordinal` against both surfaces (lightest step still clears the light-end contrast floor):

| Tier | Light | Dark |
|---|---|---|
| Reachable today | `#86b6ef` | `#cde2fb` |
| Reachable within a month | `#5598e7` | `#9ec5f4` |
| Reachable within a year | `#2a78d6` | `#5598e7` |
| Locked until retirement | `#1c5cab` | `#256abf` |
| Illiquid | `#104281` | `#184f95` |

Rendered the same way as the composition bar (horizontal stacked, legend below carrying
amounts as plain text) — same chart form, different colour job, per the method's own
separation of "pick the form" from "assign colour."

#### 6.3.2 The forecast fan — uncertainty as a wash, never a second identity

The P10–P90 band is **not** a second categorical series — it is the *same* net-worth figure's
uncertainty, so it takes the accent hue at the standard area-fill opacity (~10–13%), with the
P50 line at full 2px stroke in the same hue directly through the middle. Two hues here would
wrongly imply "two things," when the story is "one estimate, with a range." The historical
actual segment (before "today") is the same hue at full stroke weight with no band — it isn't
an estimate, so it carries no uncertainty geometry. A vertical hairline plus a "Today" label
marks the seam. Direct-label only the P50 endpoint (per `marks-and-anatomy.md`'s "label
selectively" rule) and let the hover tooltip and the "view as table" toggle carry P10/P90 at
every point — never three number labels stacked at every gridline.

#### 6.3.3 Allocation drift — the diverging pair, repurposed for policy, not liabilities

Target-vs-actual drift is the same **polarity** job the diverging pair exists for (above/below
a baseline), just answering a different question than assets-vs-liabilities: here zero means
"on policy," blue means "room to add," red means "over target and due for trimming." Each
category gets its own horizontal diverging bar growing from a centred zero-line — never a
single bar with the category's *own* categorical colour, which would conflate "which category"
with "which direction," two different jobs that must not share one channel on the same mark.

---

## 7. Type scale, spacing, radii

| Token | Value | Use |
|---|---|---|
| Hero figure | 36px/44px, semibold, proportional figures | Net worth headline (mobile); 44px/52px on desktop |
| H1 | 20px/28px, semibold | Screen titles |
| H2 | 15px/20px, semibold, uppercase, tracking +0.02em, muted | Section/group headers ("CASH & BANK") |
| Body | 15px/22px, regular | Row primary text, form labels |
| Body small | 13px/18px, regular, secondary ink | Row meta (institution, "as of") |
| Caption | 12px/16px, medium | Badges, chips |
| Table/column numerals | tabular-nums | Desktop table, chart axis ticks only — never the hero figure |

Base spacing unit 4px: **4·8·12·16·20·24·32·40·48·64**. Screen edge padding 16px mobile / 32px
desktop. Card padding 16px. Minimum touch target 44×44px (list rows min-height 56px on
mobile). Desktop table rows 40px — deliberately denser, since desktop use is mouse/keyboard,
not thumb.

Radii: cards/sheets 16px, dialog 20px, inputs/buttons 10px, chips/badges fully rounded, bottom
sheet top corners 20px (matches dialog, signals "same kind of surface").

---

## 8. Interaction, motion, gestures, shortcuts

**Motion.** 150ms ease-out for micro-transitions (lens switch count-up/down, badge state
change), 200–250ms for sheet/dialog enter (slide-up mobile, scale+fade desktop), 8px+fade for
in-tab content swaps. Nothing loops, nothing auto-plays. All of the above collapse to instant
(no animation) under `prefers-reduced-motion: reduce`.

**Mobile gestures:**
- Swipe-left on an account row → reveal Edit / Update value / Delete.
- Swipe-down on any open Sheet → dismiss (matches the visual drag handle at its top).
- Pull-to-refresh on Home/Accounts → force a sync pull.
- Long-press the FAB → "Repeat last entry" (same type, same institution, just update the
  value and as-of date) — the single highest-leverage shortcut for the "keep it current"
  problem, since most updates are "same FD, new balance."
- Horizontal swipe through the Goals carousel on Home.

**Desktop keyboard shortcuts:**
| Key | Action |
|---|---|
| `⌘K` / `Ctrl K` | Open quick-add / search command palette |
| `/` | Focus in-page search (Accounts) |
| `a` | Add new (opens step-1 picker) |
| `g` then `h`/`a`/`g` | Go Home / Accounts / Goals |
| `l` | Cycle lens (Me → Household → next member → …) |
| `j` / `k` | Move row selection (Accounts table) |
| `Enter` | Open selected row |
| `e` | Edit selected row inline |
| `Esc` | Close open Sheet/Dialog/Popover |
| `?` | Shortcut cheatsheet (`Dialog`) |

---

## 9. Accessibility

- **Contrast:** body text ≥4.5:1, large text/icons ≥3:1 against their surface in both themes
  (validated per §6.2/6.3; the two sub-3:1 status colours on light surfaces — warning, serious
  — always ship with visible icon+label, never as a bare colour fill, per the palette's own
  documented mitigation).
- **No colour-only meaning, anywhere** — restated as a hard rule because it's called out
  explicitly in the brief: status, gain/loss, ownership-complete-vs-partial, and staleness all
  carry an icon and/or word alongside colour.
- **Focus:** every interactive element has a visible 2px focus ring (accent colour, 2px
  offset); tab order follows visual/reading order; Sheet/Dialog trap focus and return it to the
  triggering element on close.
- **Screen reader:** lens changes announce via an `aria-live="polite"` region ("Viewing
  Household net worth"); charts expose a "View as table" alternative (§3.3) so no figure exists
  only as an unlabelled SVG path; form errors use `aria-describedby` tied to the field, not a
  colour change alone; icons that carry meaning (status, staleness) have accessible text
  (`aria-label` or adjacent visible text — never an icon-only status).
- **Touch targets** ≥44×44px throughout mobile; **skip-to-content** link on desktop for
  keyboard users to bypass the left rail.
- **Numeric inputs** use `inputmode="decimal"` and explicit `<label>`s (rupee amounts, share
  percentages, interest rates) — never a placeholder standing in for a label.

---

## 10. Number & date formatting (Indian context)

- **Currency:** ₹ prefix, Indian digit grouping — `₹19,29,530`, not `₹1,929,530`.
- **Compact notation** in hero figures, stat tiles, and chart axes: **Lakh (L)** below 1 crore,
  **Crore (Cr)** at/above — `₹48.65L`, `₹1.93Cr` — always with the full grouped value
  available via tap/long-press (tooltip on desktop hover). Never abbreviate to K/M/B — that's
  the wrong system for this audience.
- **Deltas:** always signed, always icon-paired — `▲ +₹1,79,000` / `▼ -₹42,100`, never a bare
  number whose sign is implied only by colour.
- **Dates:** `8 Sep 2026` (day, short month, year) in running text and row metadata; relative
  phrasing for very recent events only ("Updated 2 min ago", "Synced just now"), never for
  anything past ~24h (a stale price says "as of 5 Sep 2026", not "3 days ago" — precision
  matters more than casualness once staleness is the point).
- **"As of" is mandatory** on every market-derived value (MF NAV, stock/crypto price, gold
  rate, FX rate) — it is never omitted even when fresh, because consistency is what makes the
  staleness warning legible when it does appear.
- **Percentages:** one decimal place for returns/interest (`7.1%`), whole numbers for
  ownership/allocation shares (`60%`) since those are user-entered round numbers, not computed
  precision.
- **Fiscal context:** where a figure is inherently FY-scoped (rare at v1 — mostly future tax
  features), label explicitly as `FY 2026–27`, never a bare calendar year.

---

## 11. Insights — methodology ("this year")

Added after the owner's second-pass review: *"much better insights of net worth also future
predictability."* This section is the maths behind §3.10 — read it before implementing any
card there. Every figure quoted below as an example is the reference household's real,
reconciled number from `docs/ux/prototype.html`, not a placeholder.

**Where this lives in the codebase (real implementation, not the prototype):** every
calculation in this section is a pure function of already-decrypted local data — `src/domain/
insights/`, same rules as `src/domain/goals/` (framework-free, unit-tested, no network). The
zero-knowledge architecture (`docs/SECURITY.md`) means the server could never compute any of
this even if it wanted to; it doesn't have the numbers. The one external input any of it needs
is price history, and that has to come from the price service's daily universe downloads
(`docs/PLAN.md` M4) accumulating locally over time — a brand-new install has today's prices but
not last year's, so the trailing-12-month cards (§11.2–11.4) degrade gracefully until enough
history has accumulated (see the Empty state in §3.10).

### 11.1 Contribution vs. growth decomposition — the hero

The single most requested feature, and rightly the first card. The identity is exact, not
approximate: **start (12 months ago) + contributions + growth = end (today)**. In the
reference household: `₹1,72,40,000 + ₹15,30,000 + ₹5,25,300 = ₹1,92,95,300`.

- **Contributions** = every rupee the household *added*: bank savings set aside, EPF/NPS/PPF
  contributions, mutual fund SIPs, RSU **vested this year** (valued at vest-date price — it's
  compensation, not a market return), and home loan **principal** repaid (the interest portion
  of an EMI is not a net-worth event at all: it leaves the household's cash and was never
  counted as an asset, so it neither appears here nor as a loss elsewhere — it simply isn't in
  the bridge).
- **Growth** = the market/interest return on capital *already* invested: MF/stock/RSU price
  appreciation, EPF/PPF/NPS/SSY interest credited, property/gold revaluation.
- A category can only be in one bucket for a given rupee — the split is why the loan's EMI is
  decomposed into principal (contribution) and interest (invisible to net worth), not counted
  once as a "payment."
- **Honesty check, always shown:** if this year's realised growth is unusually low or high
  relative to the Forecast tab's long-run assumptions (§12), say so explicitly in a foot-note.
  In the reference data this year's growth (~2%, a market-correction year) sits well below the
  ~6% long-run blended assumption — the copy names this rather than let the two numbers
  silently disagree.

### 11.2 Money-weighted return (XIRR) vs. declared rate

Contributions are irregular (a lump-sum RSU vest is not the same as a level SIP), so a simple
`(end − start) / start` return overstates or understates depending on *when* money moved.
**XIRR solves for the discount rate `r` that makes the NPV of the full cash-flow series (start
as an outflow, every contribution as an outflow, today's value as the terminal inflow) equal
zero** — bisection is sufficient (no need for Newton's method's derivative), converges in well
under 100 iterations, and is the same algorithm a spreadsheet's `XIRR()` uses. Compute one
series per: whole financial portfolio (cash + deposits + investments + retirement + foreign —
**explicitly excluding property, gold, and money lent**, which aren't priced by a market feed
frequently enough for a money-weighted return to mean anything), and per major asset class
(equity mutual funds, US RSU) where the household would actually want to compare performance.

**EPF/PPF/NPS/SSY get a declared rate, not an XIRR**, shown in the same list but visually
distinct (no green "solved" styling) — these are government-declared-rate instruments where a
money-weighted return would imply a precision the instrument doesn't have. Compute the
declared rate as a value-weighted average of each instrument's stated annual rate.

**Simplification flagged for implementation:** the reference cash-flow series models
contributions as level and monthly. A real implementation has actual transaction dates (every
SIP debit, every RSU vest) and should build the cash-flow array from those directly — this
only becomes *more* accurate, never less, so it's a safe upgrade path, not a redesign.

### 11.3 Nominal vs. real (inflation-adjusted) net worth

Deflate every point in the net-worth trend to the series' own starting period:
`real(t) = nominal(t) / (1 + inflation)^(months(t) / 12)`. Plotted as a second line on the
existing timeline (§3.3, §6.3), never a separate chart — the point is the *gap* between the two
lines, which only reads clearly when they share one axis. Restate the headline as rupees, not
just a percentage: *"Of the ₹X nominal gain this year, ₹Y was real — the rest reflects
inflation, not new wealth."* In the reference year, roughly half of the nominal gain was
inflation, not growth — exactly the kind of thing a net-worth app should never let the user
misread as progress.

### 11.4 Asset allocation vs. target, with drift

The household sets (or the app suggests, e.g. by age/goal mix — out of scope for this pass) a
**target allocation** across the same seven categories used everywhere else in this document.
Drift is simply `actual% − target%` per category, rendered as the diverging bars in §6.3.3.
**Always compute the single worst-drifted category and say its name in the nudge sentence** —
a list of seven numbers with no synthesis is data, not an insight. In the reference household,
real estate is ~35 points over target, which is the same structural fact that shows up
independently in §11.6 (liquidity), §11.5 (concentration), and §12.8 (sensitivity) — a well-
built Insights screen should let a reader notice the *same* underlying story from four angles,
not read as four unrelated cards.

### 11.5 Liquidity ladder

Bucket every asset by how fast it converts to spendable cash, not by asset-class identity —
this is a different cut of the same data than the composition chart, and deliberately an
**ordinal** scale (§6.3.1):

| Tier | What belongs here |
|---|---|
| Reachable today | Cash & bank balances |
| Reachable within a month | Open-ended mutual funds, vested listed equity/RSU, physical gold (at a resale discount — note the haircut), and any FD if broken early (note the penalty) |
| Reachable within a year | Money lent to family/friends with an expected-return date — never "guaranteed," say so |
| Locked until retirement | EPF, PPF, NPS, Sukanya Samriddhi — legally restricted, not a liquidity choice |
| Illiquid | Real estate — sellable, but timeline and price are both unpredictable, unlike every tier above it |

The tiers must sum to exactly total assets — there is no "unclassified" bucket; every holding
type maps to exactly one tier. Cross-reference against goal allocations (§2.2): the household
may have a large "reachable within a month" figure that is almost entirely earmarked elsewhere,
which is worth a foot-note precisely because it's the honest, slightly deflating truth behind a
big reassuring liquidity number.

### 11.6 Concentration risk

Three questions, in priority order: **(1) employer** — sum salary-adjacent exposure (EPF +
RSU/ESPP from the same employer; salary itself isn't a balance-sheet figure but belongs in the
sentence, not the number); **(2) single stock** — the largest single-issuer equity position as
a % of total assets; **(3) single institution** — a ranked list (bank, AMC, employer) by total
exposure, rendered as single-hue ranked bars (magnitude comparison, not identity — §"choosing a
form"). Flag explicitly when the same employer shows up in more than one line (salary + EPF +
RSU is three bets on one company, not one) — this is the whole point of the card, not a
footnote to it.

### 11.7 Liability burn-down

Solve, don't author, the loan's **effective monthly rate** from the three facts the household
already gave the app (outstanding balance, EMI, remaining tenure) via bisection on the standard
amortisation formula `EMI = P·r·(1+r)ⁿ / ((1+r)ⁿ−1)` — this is the same technique as the XIRR
solver, applied to a fully deterministic (non-market) cash flow. From the solved rate, derive
whatever the household **also** originally borrowed (given an assumed original tenure) and
therefore how much of every EMI paid to date was interest vs. principal — rendered as the
2-segment stacked bar in §6.3. A **live prepayment calculator** (`monthsToPayoff` from the same
solved rate) belongs in Forecast (§12), not here — "what if I prepay" is a forward scenario,
this card is a status report on what already happened.

### 11.8 What changed, data hygiene, and milestones

Three small, high-frequency-value cards that round out the screen:

- **What changed this month** — every holding's month-over-month delta, sorted by magnitude,
  signed and icon-paired per §10's delta convention, both directions shown (the biggest *drop*
  is as newsworthy as the biggest gain).
- **Data hygiene** — rank manually-tracked values by `(days since asOf) × (share of net
  worth)`, not age alone: a 5-month-stale valuation on 70% of net worth matters more than a
  2-day-stale price feed lag on a small gold holding, even though the gold number is
  chronologically "more stale." Distinguish the two *kinds* of staleness in copy — feed lag
  (system will fix itself) vs. manual neglect (only the user can fix it) are different asks.
- **Milestone** — the next clean round number above current net worth, months-away at the
  trailing pace, and a doubling-time figure computed from `ln(2) / ln(1 + rate)`. **Always
  caveat which rate**: the milestone uses *last year's overall growth including new savings*,
  which is a real, useful pace to know but is not an investment return, and must never be
  presented next to XIRR (§11.2) without that distinction — conflating the two is the single
  easiest way to make this feature dishonest.

---

## 12. Forecast — methodology ("what happens next")

The predictive half of the same owner request. The organizing rule, stated once because it
governs every decision below: **show a range, never a point estimate, and make every
assumption visible and editable.** A single "you'll have ₹X in 2046" number is a lie by
omission; this section exists to stop that lie from ever shipping.

### 12.1 Assumptions — the owner must sanity-check these

Every number below is a **starting point**, not a researched capital-markets assumption, and
the UI says so (§3.11's Assumptions card, live-editable). Flagging explicitly for the owner's
own judgement, per the brief's own request:

| Asset class | P10 | P50 (median) | P90 | Note |
|---|---|---|---|---|
| Cash & Bank | 2.0% | 3.5% | 5.0% | Savings-account-like, low variance |
| Deposits (FD/RD) | 6.0% | 7.0% | 7.5% | Near-fixed once booked; the band is mostly rate-cycle risk at renewal |
| Investments (equity MF/stocks) | 6.0% | 12.0% | 18.0% | The widest realistic band for Indian equity over a multi-year horizon |
| Retirement & Small Savings | 7.5% | 8.2% | 9.0% | Blended EPF/PPF/NPS/SSY declared-rate band, deliberately narrow |
| Foreign (US stocks/RSU) | −2.0% | 10.0% | 22.0% | Widest band in the table — single-stock **and** FX risk stacked |
| Property & Valuables | 2.0% | 5.0% | 8.0% | Real estate appreciates slower and more smoothly than equity, historically |
| Insurance & Lending | 0.0% | 2.0% | 4.0% | Mostly money lent at no/low interest — not a growth asset |
| Inflation | — | 6.0% | — | Matches the goals engine's existing default (`docs/PLAN.md`) |

These are nominal annual returns in INR. **The owner should replace every one of these with
either researched long-run figures or their own house view before this ships** — they are
deliberately visible and editable in the UI specifically so nobody mistakes them for
researched truth. The one that matters most for *this* household is Property, per §12.8.

### 12.2 The projection engine

A pure function `project(percentile, scenario, years) → [{year, assets, liability, net}]`,
stepped **monthly, not annually** — this is not a stylistic choice: an annual-step
approximation of the same inputs measurably understates a monthly-SIP household's terminal
value (confirmed while building this spec — the annual approximation put a goal ~₹5L short of
a target that monthly-compounding correctly showed as met). Each category compounds at its own
assumption, converted to a monthly rate via `(1+annual)^(1/12) − 1`, with its own annual
contribution added in monthly instalments; the home loan amortises on its own solved schedule
(§11.7) in parallel, independent of the market percentile, because a loan doesn't have a P10.
**Every projection starts from today's actual net worth** (`CATS`/`LENS` — the same figures
every other screen in the app uses) — a projection that doesn't reconcile with the number on
Home is worse than useless, it's actively misleading.

### 12.3 The fan: P10 / P50 / P90, and what it is *not*

Run the engine three times — once per percentile — and plot the P50 as the solid line, P10–P90
as the wash between them (§6.3.2). **This is a calibrated illustration, not a Monte Carlo
simulation.** A real Monte Carlo would sample each asset class's return from a distribution
every simulated month/year, honour the correlation between classes (equity and RSU are not
independent; property and everything else mostly are), and report percentiles across thousands
of simulated paths. What's built here instead runs the **deterministic** engine three times at
three fixed rates — cheap, fully client-side, and directionally honest (the band widens over
time, as it should), but it understates true tail risk because it never lets one bad month
compound with another. **Flagging this explicitly as a v1 simplification** (§13) — a
real Monte Carlo engine (even a client-side one; nothing here needs the server) is the natural
v2 upgrade once the return-distribution assumptions above are researched enough to bear the
extra precision.

### 12.4 Scenario mechanics — what each control actually does

Every slider and toggle mutates a single `scenario` object that the engine reads fresh on
every recompute — nothing is a canned alternate dataset:

| Control | Mechanism |
|---|---|
| Extra monthly SIP | Adds to the Investments category's monthly contribution |
| Salary hike | Multiplies **every** category's contribution by `(1 + hike%)` |
| Market crash today | A one-time ×0.7 haircut to Investments and Foreign at month 0, then normal compounding resumes — models a crash today, not a crash at an arbitrary future date |
| 6 months without income | Zeroes all contributions for months 1–6 only, then resumes at the normal rate |
| Buy a second property (year 3) | At month 36: draws a down payment proportionally from Cash/Deposits/Investments (clamped so it can never overdraw the pool), adds the new home's value to Property, adds a new loan to the liability side |
| Child's college withdrawal (2038) | At the corresponding month: draws a lump sum proportionally from Investments/Retirement/Foreign (same overdraw clamp), continues compounding the reduced base |
| Prepay vs. invest (a shared lump-sum slider) | Feeds **two independent, real calculations** — `monthsToPayoff` on the reduced loan balance (interest saved, months saved) and a plain compound-growth projection of the same amount at the Investments assumption over the loan's remaining tenure — rendered side by side with **no stated winner**, because which is "better" depends on risk tolerance the app can't see |

**Every clamp exists to prevent a scenario from silently going negative** (drawing more from a
pool than it holds) — the two life-event toggles cap their draw at 90% of the relevant pool
rather than let it run through zero into negative territory, which would otherwise be possible
for an aggressive combination of toggles (e.g. a crash *and* a house purchase in the same run).

### 12.5 Per-goal probability of funding — an explicit heuristic, not a real distribution

Reuses the Goals data model (§3.7/§2.2) rather than inventing a parallel one. For each goal:
derive a return band's **half-width** from the category mix of that specific goal's *funding
sources* (each funding item is tagged with its asset-class key directly — never inferred from
its free-text display label, which can't be trusted to pattern-match reliably), then **centre
that band on the goal's own stated `expectedReturn`** rather than re-deriving the median from
category assumptions — the goal's own assumption was an explicit, editable choice (§2.2's goal
model) and this heuristic respects it rather than silently overriding it. Locate the goal's
inflated target within the resulting P10/P50/P90 corpus range and interpolate a probability
(90% at or below P10, 50% at P50, 10% at or above P90, linear between). **This is a
calibrated-band heuristic, explicitly not a real probability distribution**, and the UI copy
says so (§3.11) — it's useful for *relative* comparison between goals (this goal's odds are
better than that one's) and for showing *what a fix looks like* (Education's odds at the
required SIP vs. at the current one), not as a literal statistical probability a household
should plan around.

### 12.6 Financial independence & coast-FI

`corpus needed = annual expenses ÷ safe withdrawal rate` (both owner-editable sliders,
withdrawal rate 3–5%). Find the **first year in the P50 path where projected net worth clears
that corpus** — a simple linear search over the already-computed path, no separate maths.
**Coast-FI** answers a different question: if the household stopped contributing to their
*investable* assets today (deliberately excluding property — coast-FI is about assets that
could plausibly be spent down in retirement, and a primary residence usually isn't), would
those assets alone, left to compound at their own blended rate, still clear the FI corpus by a
stated retirement age? Both numbers should be read together: a household can be short of FI
today but already "coasting" — meaning the *rate of new saving* is now optional, not the
saving itself.

**Known simplification, flagged for implementation:** the FI corpus is computed once against
**today's** expense assumption and compared against a **nominal** projection — a fully rigorous
version would inflate the expense figure forward to whatever year FI is reached (or compare
against the *real* net-worth path instead of nominal) before declaring the corpus "met." As
built, this slightly understates the true corpus needed in a future year. Left as a v1
simplification given scope (§13) rather than silently presented as exact.

### 12.7 Sensitivity — which assumption actually matters, for *this* household

Bump each category's P50 return by exactly +1 percentage point, one at a time, re-run the
10-year P50 projection, and rank the resulting deltas — plus one more run with every
contribution scaled up 10%, to compare "a better assumption" against "saving more" on the same
axis. **This is a real, computed, one-at-a-time sensitivity (a tornado ranking), not an
assertion.** In the reference household, the property return assumption dominates every other
lever, including a 10% jump in contributions — a direct, honest, non-generic consequence of
70% of net worth sitting in one low-yield asset class. This is the single most important
number the Forecast tab produces: it tells the household *what to actually go verify* (is 5%
the right property assumption?) rather than which lever to pull.

**Known simplification:** editing an assumption in §3.11's live inputs updates the fan chart
and FI numbers immediately (§12.2's engine reads `ASSUMPTIONS` fresh on every call) but does
**not** re-trigger the goal-probability (§12.5) or sensitivity (§12.7) cards, which are computed
once per session against the baseline assumptions in the prototype. A shipped implementation
should make these fully reactive too — the prototype's scope cut here is about avoiding a
recompute cascade on every keystroke, not a modelling limitation.

---

## 13. Explicitly NOT in v1

Called out so nobody mistakes an absence for an oversight:

- Statement/CAS PDF import UI (parsing infra lands per `PLAN.md` M6; v1 is manual entry only).
- Any bank/broker account-linking or aggregator integration — this app never asks for
  net-banking credentials or account-aggregator consent; that would break the zero-knowledge
  premise at the door.
- Push notifications of any kind (no re-engagement pings — calm, per Principle 6).
- Multi-currency wallets beyond the specific USD RSU/ESPP + FX-to-INR case already in the
  schema — no general "add a EUR account" support yet.
- A transactions/expense ledger or budgeting features — this is a balance-sheet app, not a
  cash-flow app; it tracks *what you have*, not *what you spent*.
- Gamification of any kind — streaks, comparisons to "people like you," achievement badges.
- Data export as formatted PDF/Excel reports (encrypted raw backup export exists per §3.9;
  human-readable reports are a later nice-to-have).
- Children or dependents as household members with their own lens/login — a child is a goal
  beneficiary (e.g. Sukanya Samriddhi tagged to "Ananya's education"), not a member with
  ownership shares, until they're an adult who'd actually unlock the app.
- Native mobile app / app-store distribution — PWA only, per `PLAN.md`; the Capacitor shell is
  a kept-open door, not a v1 deliverable.
- Any AI/chat assistant surface.
- Advisor marketplace, community, or social features of any kind — this is a private
  household tool, deliberately not a platform.

**Added in the Insights/Forecast pass (§11–§12) — also deliberately out of scope:**

- **A real Monte Carlo simulation.** The forecast fan (§12.3) is three deterministic runs at
  fixed percentile rates, not thousands of correlated random draws. It's the right level of
  investment for v1 and is honestly labelled as an estimate; a proper simulation (with
  researched volatility and cross-asset correlation) is the natural v2 upgrade, entirely
  client-side, once the return assumptions in §12.1 are researched enough to bear it.
- **Tax modelling of any kind** — capital gains, LTCG/STCG distinctions, indexation, Section 80C
  contribution limits, surcharge. Every projection in §12 is pre-tax. A household near the LTCG
  exemption threshold or planning a tax-triggering redemption should not treat any Forecast
  number as post-tax.
- **A fully reactive assumption graph.** Editing a return assumption updates the fan chart and
  FI numbers live; it does not re-run goal-probability or sensitivity in this prototype
  (§12.7's flagged simplification). A shipped version should make the whole graph reactive.
- **Real transaction-level XIRR cash flows.** §11.2's XIRR uses a modelled level-monthly
  contribution series; the real implementation should build the cash-flow array from actual
  SIP/vesting transaction dates once M6 (statement import) or manual transaction entry exists.
- **Per-instrument historical volatility calibration.** The P10/P90 return bands in §12.1 are
  authored starting points, not derived from this household's (or any real) historical return
  series. Calibrating them from actual AMFI/NSE/Yahoo price history the app already downloads
  (`docs/PLAN.md` M4) is a natural, purely-client-side upgrade.
- **Multi-generational or multi-scenario comparison views** (e.g. saving two named scenarios
  side by side, or a scenario history). The Scenario Lab (§3.11) is single-state and
  live-editable, not a scenario manager.
- **A household-level allocation *policy editor*.** §11.4 assumes a target allocation exists;
  v1 does not yet include the UI to set or change it (only to see drift against it).
