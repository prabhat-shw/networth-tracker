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

**Mobile — 4-item bottom tab bar:** `Home` · `Accounts` · `Goals` · `More`.

```
┌─────────────────────────────┐
│                              │
│         (screen)             │
│                              │
├──────┬──────┬──────┬────────┤
│ Home │Accts │ Goals│  More  │
└──────┴──────┴──────┴────────┘
        (FAB "+" floats above, bottom-right, on Home/Accounts/Goals)
```

**Why 4, and why not a 5th "Add" tab.** A tab that just opens a sheet and returns you to
where you were isn't a destination — it's an action, and actions belong on a FAB that floats
over every relevant screen, not a tab that's only useful when you happen to be on it. Keeping
the bar to 4 keeps every target comfortably thumb-sized on a small phone.

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

**Desktop — left rail, 5 items:** `Home` · `Accounts` · `Goals` · `Household` · `Settings`,
plus a persistent top bar (lens switcher, global search / quick-add via `⌘K`/`Ctrl K`, sync
status, theme toggle, account menu). Household is promoted to the rail on desktop because
laptop sessions are disproportionately "sit down once a month and reconcile everything"
sessions, where ownership edits happen; phone sessions are disproportionately quick checks.

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
│⌂  │                                                           │
│▤  │                                                           │
│◎  │                                                           │
│⚭  │                                                           │
│⚙  │                                                           │
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
| Charts | `Recharts` — `AreaChart` (net worth trend), horizontal stacked `BarChart` (composition), no pie/donut (see §7.3) |

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
  total per §"choosing a form" series ladder.
- **Assets vs. Liabilities (net worth = A − L framing, e.g. a future net-worth waterfall):**
  the diverging pair, blue (assets) ↔ red `#e34948`/`#e66767` (liabilities), neutral grey
  midpoint — this is polarity (which side of zero), not identity, so it deliberately does *not*
  borrow from the categorical set.
- **Goal meters:** fill in the accent hue (or the goal's own assigned categorical colour once a
  household has enough goals to need distinguishing at a glance), unfilled track a lighter step
  of the same ramp — never grey-vs-colour, which reads as "broken" rather than "unfilled."

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

## 11. Explicitly NOT in v1

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
- Scenario/what-if simulators beyond the goal engine's built-in required-SIP projection
  (no drag-a-slider "what if the market crashes" tool at v1).
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
