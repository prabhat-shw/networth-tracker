<div align="center">

# 🔐 NetWorth

**A zero-knowledge household net-worth tracker built for India.**

Every asset and liability your household owns — including the joint ones —
with ownership shares, goal earmarking, and daily valuation from public price feeds.
Encrypted on your device. The server only ever stores ciphertext.

`TypeScript` · `Next.js 16` · `React 19` · `Tailwind v4` · `Drizzle + Postgres` · `WebCrypto` · `PWA`

</div>

---

## Why

INDMoney and its peers track what they can pull under a single PAN. They cannot represent a
real Indian household: a joint savings account, a flat bought 50/50 with your spouse, ₹2L
lent to a cousin, a chit fund, gold in a locker, your spouse's EPF, RSUs vesting in USD, a
rental security deposit.

This tracks all of it — and knows **who owns what share**, and **what each rupee is for**.

- 👥 **Household, not individual** — ownership shares per record; see "my net worth",
  "household net worth", or per person.
- 🎯 **Goal earmarking** — tag money to a house, education, retirement, emergency fund.
  Everything else shows honestly as *Unallocated*.
- 🧾 **Everything counts** — bank/FD/RD, PPF/EPF/NPS/SSY, mutual funds, stocks, US RSUs,
  crypto, gold, property, vehicles, insurance surrender value, money lent, chit funds —
  and every loan and card on the other side.
- 🔒 **Zero-knowledge** — records are AES-256-GCM encrypted on your device. A full server
  breach yields random bytes. Sharing with your spouse works by wrapping keys, not by
  trusting a server.
- 📴 **Offline-first PWA** — mobile-first, with dense tables on the laptop.

## Status

M0 — foundation. Not yet usable. See [`docs/PLAN.md`](docs/PLAN.md) for the full roadmap and
[`docs/STATE.md`](docs/STATE.md) for exactly where the build is.

## Quick start

> Requires Node ≥ 24 (`.nvmrc`) and pnpm via Corepack (`corepack enable`).

```bash
pnpm install
git config core.hooksPath .githooks   # once: blocks direct pushes to main (ADR-0008)
cp .env.example .env                  # set POSTGRES_PASSWORD and BETTER_AUTH_SECRET
pnpm dev                              # http://localhost:3000
```

Verification: `pnpm test` · `pnpm typecheck` · `pnpm check` · `pnpm check:docs`

Self-host (production topology, ADR-0006):

```bash
docker compose up -d --build   # app + Postgres + Caddy, published only on your tailnet
```

## Docs

| Doc | What it is |
| --- | --- |
| [`docs/PLAN.md`](docs/PLAN.md) | The full plan: product, security, architecture, roadmap |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layers and data model |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model and controls |
| [`docs/CONTEXT.md`](docs/CONTEXT.md) | How work is split across short sessions |
| [`docs/decisions/`](docs/decisions/) | ADRs — the *why* behind every decision |

## Licence

Private project. All rights reserved.
