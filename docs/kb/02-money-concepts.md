# 2. Money concepts, in plain English

Every financial term this app uses. No prior knowledge assumed. Skim it once; come back when
a word on screen puzzles you.

## The basics

**Asset** — anything you own that has value: money in a bank, a flat, gold, shares.

**Liability** — anything you owe: a home loan, a credit card bill, money borrowed from your
brother.

**Net worth** — assets minus liabilities. If you own a ₹1 crore flat with a ₹60 lakh loan
against it, that contributes ₹40 lakh to your net worth, not ₹1 crore. This single number is
what the app exists to compute honestly.

**Liquidity** — how quickly you can turn something into spendable money. A savings account is
instant. A flat takes months. A PPF account is locked for years. Two households with the same
net worth can be in very different situations if one of them cannot reach any of it.

## How things are owned

**Ownership share** — the percentage of an item that belongs to a person. A joint account is
usually 50/50. The app stores this on every item, which is how it can show "my" net worth and
"household" net worth as different, both correct, numbers.

**Nominee** — the person who receives an asset if the owner dies. Not the same as ownership;
recorded for completeness, and it does not affect any total.

## Where Indians keep money

**Savings / current account** — everyday bank money.

**FD (Fixed Deposit)** — money locked with a bank for a fixed term at a fixed interest rate.
**RD (Recurring Deposit)** is the same idea, funded monthly.

**PPF (Public Provident Fund)** — a 15-year government savings scheme, tax-free interest.

**EPF (Employees' Provident Fund)** — retirement savings deducted from salary, matched by the
employer. **VPF** is voluntary extra contribution to the same account.

**NPS (National Pension System)** — a market-linked retirement account, Tier 1 (locked) and
Tier 2 (flexible).

**SSY (Sukanya Samriddhi Yojana)** — a government savings scheme for a girl child.

**NSC / KVP / SCSS / Post Office schemes** — other small-savings products with fixed returns.

## Market investments

**Share (stock, equity)** — a slice of a company. Priced continuously on an exchange (**NSE**
and **BSE** in India).

**Mutual fund** — a pooled investment run by a fund house. You own **units**.

**NAV (Net Asset Value)** — the price of one mutual fund unit, published once per day. This is
why the app values funds "as of" a date rather than live.

**Folio number** — your account number with a fund house.

**Direct vs Regular plan** — *Direct* has no distributor commission, so it grows faster.
*Regular* pays a commission out of your returns. Same fund, different cost.

**SIP (Systematic Investment Plan)** — investing a fixed amount every month automatically.

**ETF** — a fund that trades like a share.

**SGB (Sovereign Gold Bond)** — government bonds priced to gold, paying interest on top.

**RSU (Restricted Stock Unit)** — shares your employer grants you that become yours over time
(**vesting**). Unvested RSUs are a promise, not an asset — the app tracks them separately and
leaves them out of net worth by default.

**ESPP** — a scheme to buy your employer's shares at a discount.

## Statements and records

**Demat account** — the electronic account holding your shares.

**CAS (Consolidated Account Statement)** — a single statement listing your holdings across
fund houses and demat accounts, issued by **NSDL**/**CDSL** (depositories) or **CAMS**/**KFin**
(fund registrars). A future version of the app will read these PDFs *on your device* to save
you typing.

**AMFI** — the mutual fund industry body that publishes every fund's NAV daily. The app uses
that free public file to value your funds.

## Measuring how you are doing

**CAGR** — the smoothed annual growth rate of a single lump sum.

**XIRR** — the same idea when money went in and out at irregular times, which is what actually
happens with SIPs. The app prefers XIRR because it tells the truth about real investing.

**Inflation** — the rate at which money loses purchasing power. If your net worth grows 6% and
inflation is 6%, you are standing still. The app can show an **inflation-adjusted (real)**
line next to the nominal one.

**Contribution vs growth** — of the amount your net worth rose this year, how much was money
you *added* versus money your investments *earned*? Most apps cannot tell you; this one makes
it a headline, because it is the difference between "I saved hard" and "the market was kind".

## Goals

**Earmarking (allocation)** — tagging money to a purpose. ₹8 lakh of your mutual funds might
be earmarked for a house and the rest for retirement.

**Unallocated** — money not tagged to any goal. Shown plainly rather than hidden.

**Inflated target** — what a goal will actually cost when you get there. ₹50 lakh of education
in 2038, at 10% education inflation, needs far more than ₹50 lakh.

**Required SIP** — the monthly investment that would close the gap between where you are and
what the goal needs, at an assumed return.

**Emergency fund** — money you can reach immediately, usually 6 months of expenses. A fund
that is 89% "funded" but sitting in a deposit that matures next year is not an emergency fund,
which is why the app judges goals on suitability, not just totals.

**FI (Financial Independence)** — the point where your investments could cover your expenses
indefinitely.
