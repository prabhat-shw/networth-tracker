# 1. What is this app?

## The problem it solves

Ask most Indian finance apps "what am I worth?" and they answer for **one person, with one
PAN, holding assets the app's data provider can see**. That misses most of a real household:

- the savings account you hold **jointly** with your spouse
- the flat you bought **50/50**, and the home loan against it
- your spouse's **EPF**, which is part of the family's wealth even if not yours
- the **₹2 lakh you lent your cousin** last year
- gold in a **bank locker**
- **RSUs** vesting in dollars
- the **security deposit** with your landlord
- a **chit fund** your mother runs

None of that shows up. So the number the app shows is confidently wrong, and you end up back
in a spreadsheet.

## What this app does instead

It is a **household balance sheet**. Three ideas make it different:

### 1. Everything counts

Around twenty kinds of assets and liabilities — bank accounts, deposits, PPF/EPF/NPS/Sukanya
Samriddhi, mutual funds, shares, foreign shares and RSUs, crypto, gold, property, vehicles,
insurance policies with a surrender value, money you lent, chit funds — and on the other side
home loans, car loans, credit cards, and money you borrowed from family.

If it changes what you are worth, it belongs here.

### 2. Ownership is explicit

Every item records **who owns what percentage**. A joint account is 50/50. A flat might be
60/40. Your own PPF is 100% yours.

That lets the app answer three different questions honestly:

- **My net worth** — my share of everything
- **Household net worth** — everything, both of us
- **Priya's net worth** — her share

You switch between these with one control, and every number on screen re-computes. A joint
account never silently reads as if it were entirely yours.

### 3. Money is tagged to a purpose

You can earmark money to goals — *buy a house*, *Ananya's education*, *retirement*,
*emergency fund*. Anything you have not tagged shows up as **Unallocated**, plainly, so it
never disappears into a vague "other".

For each goal the app works out what the target will cost by the time you get there (₹50 lakh
for education in 2038 is not ₹50 lakh today), how far along you are, and what you would need
to invest monthly to close the gap.

## What it deliberately does not do

- **It does not connect to your bank.** No net-banking password, no SMS reading, no email
  scraping. You enter what you own; the app fetches only *public* prices (NAVs, share prices,
  exchange rates) to value it.
- **It does not sell or share anything.** There is no analytics, no tracking, no third-party
  script. It cannot leak what it cannot read — see [How your privacy works](03-how-privacy-works.md).
- **It does not give investment advice.** It tells you what you have and, where it projects
  forward, it shows a range and its assumptions rather than a confident single number.
- **It is not a budgeting or expense app.** Day-to-day spending is a different problem.

## Who it is for

A household — typically two adults — who want one honest number, and the ability to see how
that number splits between them and what it is earmarked for. It is built first for one
family, which is why it can afford to handle chit funds and lent money instead of only the
assets that are easy to automate.
