# NetWorth Tracker — Production Plan (v0 → v1)

## Context

INDMoney and its peers only track what they can pull from a broker/AMC feed under a single
PAN. They cannot represent a real Indian household: a joint savings account, a flat bought
50/50 with your spouse, ₹2L lent to a cousin, a chit fund, physical gold in a locker, your
wife's EPF, an RSU grant vesting in USD, a rental security deposit. This project builds the
thing that does — a **household net-worth ledger that tracks every rupee of net worth,
however small, and knows who owns what share of it**.

Because that dataset (every account, every balance, PAN, folio numbers) is more sensitive
than any single bank's view of you, the app is built **zero-knowledge**: data is encrypted
on your device before it ever leaves, and the server — whether Vercel or the box in your
house — stores only opaque ciphertext.

The enabling insight: **prices are public, holdings are private.** NAVs, share prices, and
FX rates are the same for everyone, so the server can cache them without knowing anything
about you, and your device does all valuation math locally. Zero-knowledge costs us almost
nothing here.

### Decisions locked with the owner

| Decision | Choice |
| --- | --- |
| Access model | Household — you + spouse/family, joint ownership with shares |
| Security model | Zero-knowledge E2EE (client-side AES-256-GCM; server never sees plaintext) |
| Production hosting | **Home server / NAS, reachable only over Tailscale** |
| Staging hosting | Vercel + Neon — **synthetic demo data only, never real data** |
| Stack v1 | Next.js 16 + React 19 + TypeScript strict |
| Stack v2 (later) | Rust (Axum) backend replacing the sync/price server behind an identical contract |
| Delivery | Installable PWA, mobile-first; structured for a Capacitor shell later; dense desktop views for laptop use |
| Data intake | Manual entry + automatic public prices, then statement/CAS import (parsed on-device) |
| Process | GitHub Issues + Projects kanban, ADR per decision, one issue = one session |

Assumption flagged: the delivery answer referenced an option #4 that didn't exist. Read as
"PWA mobile-first now (#1), keep the native-shell path open (#2), and give the laptop a
proper dense view (#3)." Say the word if that's wrong.

---

## 1. Product shape

**One sentence:** a private household balance sheet — every asset and liability, with
ownership shares, valued daily from public price feeds, and a net-worth timeline you can
scrub back through.

Views that INDMoney can't give you:
- **My net worth** (my share of everything, including 50% of the joint flat)
- **Household net worth** (everything, all members)
- **Per-person** and **per-goal** breakdowns
- **Illiquid vs liquid**, **INR vs foreign**, **held-by-institution** concentration

### Asset taxonomy (schema covers all of it from day one; UI arrives per phase)

- **Cash & bank** — cash on hand, savings, current, joint accounts, sweep-in, wallets/UPI balances
- **Deposits** — FD, RD, corporate FD, tax-saver FD, post-office TD/MIS
- **Small savings** — PPF, EPF (yours + spouse's), VPF, NPS T1/T2, Sukanya Samriddhi, NSC, KVP, SCSS
- **Market** — mutual funds (folio/scheme, direct/regular, SIP), Indian equity, ETFs, bonds, SGB, T-bills, RBI floating-rate bonds, unlisted/ESOP-in-private-company
- **Foreign** — US stocks, RSU/ESPP with vesting schedules, foreign bank balances, USD→INR FX
- **Crypto** — spot holdings per exchange/wallet
- **Physical** — gold/silver (jewellery, coins, digital gold), real estate with valuation history, vehicles, other valuables
- **Insurance** — endowment/money-back/ULIP surrender & maturity value, term (₹0 asset, tracked for cover)
- **Receivables** — money lent to family/friends with repayment schedule, security deposits, pending reimbursements, chit funds, P2P lending
- **Employer** — gratuity accrual, superannuation, unvested RSU (tracked separately, excluded from net worth by default)
- **Liabilities** — home/car/personal/education loan with amortisation, credit card outstanding, loan against property/FD/gold, borrowings from family, EMI calendar

Every record carries: `owners[] {member, sharePercent}`, `includeInNetWorth`, `institution`,
`tags[]`, `notes`, `asOf`, an optional `document` (encrypted attachment), and
`allocations[]` (see goals, below).

### 1.1 Goals & earmarking — a first-class feature

Net worth answers "how much do I have". Goals answer "what is it *for*". Every rupee can be
earmarked to a purpose — buying a house, the kids' education, retirement, emergency fund —
and anything not earmarked shows up honestly as **Unallocated**.

**Model.** Two record types:

- `goal` — name, kind (`house | education | retirement | emergency | vehicle | wedding |
  travel | custom`), `targetAmount` (in *today's* rupees), `targetDate`, `inflationRate`
  (default 6%, 10% for education), `expectedReturn`, `priority`, `owners[]`, `notes`
- `allocation` — `{ goalId, sourceId (holding/account/property/…), mode: percent | fixed,
  value }`. Invariant enforced client-side and unit-tested: allocations per source sum to
  ≤ 100% / ≤ current value; the remainder is implicitly Unallocated.

**Rules & conveniences.** Auto-tag rules (e.g. *all NPS → retirement*, *Sukanya Samriddhi →
Ananya's education*, *this FD → emergency fund*) so you don't hand-tag every record.
Liabilities can be tagged too, so the house goal nets the home loan against the property and
shows **equity toward goal**, not gross value.

**Derived metrics** (pure functions, unit-tested in `domain/goals`):
- inflated target = `targetAmount × (1 + i)^years`
- progress % , shortfall, **required monthly SIP** to close the gap at `expectedReturn`
- projected corpus at `targetDate` vs. required → **on-track / at-risk / off-track**
- **suitability warning** — a goal 18 months out funded by small-cap equity gets flagged
- multi-goal contention: total earmarked vs. total net worth, and which goals are underfunded

**Views:** net worth *by goal* (stacked over time), per-goal drill-down with its funding
holdings, per-member goals, and the Unallocated bucket as a nudge to tag it.

---

## 2. Security architecture (the core of this project)

Full detail goes in `docs/SECURITY.md` (threat model) and ADRs 0002–0006.

### Key hierarchy

```
passphrase --Argon2id(64MB, t=3)--> unlockKey ──┐
recovery code (24 words, offline)  ------------┤--> unwraps userPrivateKey (ECDH P-256)
passkey PRF (optional fast unlock) ------------┘
                                                     │
                          householdDataKey (HDK, AES-256-GCM, random)
                          wrapped once per member via ECDH(HDK ← member pubkey)
                                                     │
                     every record: AES-256-GCM(HDK, iv=random96, aad=recordId|version|type)
```

- **Sharing with spouse** = wrapping the HDK to their public key. The server relays the
  wrapped blob; it never holds an unwrapped key.
- **Recovery** = the printed recovery kit, *plus* social recovery: if you lose everything,
  your spouse re-wraps the HDK to your new identity key. Two independent paths, both offline.
- **Server sees:** `household_id`, `record_id` (random UUID), `version`, `updated_at`,
  `ciphertext`, `deleted`. Not the record type, not a single number. Client downloads all
  records (the dataset is small) and indexes locally.

### Non-negotiable controls

- Invite-only registration; Better Auth with passkeys + email OTP (auth is for *sync access*,
  independent of the crypto)
- Strict CSP with nonces, no third-party scripts, no analytics, no CDN
- CAS/statement PDFs parsed **entirely in-browser** (pdf.js in a worker, no network) — the
  PDF and its password never reach any server
- Price fetches download **whole public universes** (all AMFI NAVs, NSE universe, top US
  tickers), never per-symbol queries — so request patterns can't leak your holdings
- Rate limiting, no PII in logs, encrypted nightly backups (`pg_dump | age`) with a
  scheduled restore drill
- CI security gates: gitleaks, CodeQL/semgrep, `osv-scanner`, SBOM, dependency review
- **Plaintext-scan test**: dump the test DB and assert no known plaintext value appears in
  any column — the regression test that keeps zero-knowledge honest

### Explicit trade-offs accepted

Lose passphrase *and* recovery kit *and* spouse's copy → data is gone; no server-side
reports, alerts or email ingestion; no password reset that recovers data.

---

## 3. System architecture

```
┌────────────────────── Your device (the only place plaintext exists) ─────────────────────┐
│  Next.js client (PWA, offline)                                                           │
│   crypto/ (WebCrypto+Argon2)  domain/ (valuation, XIRR, ownership math — pure & tested)   │
│   Dexie (ciphertext at rest + in-memory plaintext cache)   parsers/ (CAS, CSV) in workers │
└───────────────┬──────────────────────────────── downloads public price universes ────────┘
                │ sync: opaque blobs                                    ▲
┌───────────────▼────────────────────────────────────────────────┬──────┴──────────────────┐
│  Sync API (thin, replaceable)                                  │  Price service          │
│   POST /api/sync/pull|push   auth   household/key-wrap   blobs │   AMFI NAVAll daily     │
│   Postgres via Drizzle — ciphertext only                       │   Yahoo equity/US/crypto│
└────────────────────────────────────────────────────────────────┴───  Frankfurter FX ─────┘
```

The server is deliberately dumb — a versioned blob store plus a public-data cache. That is
what makes the **M9 Rust/Axum rewrite** a clean weekend project rather than a rebuild: the
contract in `docs/api/CONTRACT.md` is executable, and the same contract test suite runs
against either implementation.

**Sync semantics:** per-record `version` + `updatedAt` + soft-delete tombstones,
last-write-wins at record level, offline queue with optimistic concurrency (409 → re-pull →
merge → retry). Same model that already works in paisa-diary.

**Honest note:** with E2EE, React Server Components can't render your data, so Next.js here
is an app shell + API host, not an SSR engine. That is a real trade-off of choosing Next.js
(ADR-0007), and it's fine — it buys one deployable unit that runs identically on Vercel and
in Docker at home.

### Stack (all versions verified live today)

Next.js 16.3 · React 19.2 · TypeScript strict · Tailwind v4.3 + shadcn/ui · Dexie · Zustand ·
Recharts · Zod 4 · Drizzle 0.45 + Postgres 17 · Better Auth 1.7 + SimpleWebAuthn 14 ·
hash-wasm (Argon2id) · pdfjs-dist 6 · Vitest 5 + Playwright 1.63 · pnpm · Node ≥24

### Deployment topology

- **Production (trusted):** Docker Compose — app + Postgres + Caddy — on your home box,
  published only on the tailnet via Tailscale (with its automatic HTTPS certs). Nothing is
  exposed to the public internet. Nightly `pg_dump | age` to an external drive.
- **Staging (untrusted):** Vercel + Neon, `DEMO_MODE=true`, seeded synthetic household.
  Guarded by a CI check that fails the deploy if demo mode is off. Even though Vercel could
  only ever see ciphertext, real data never goes there.
- Migrations via Drizzle Kit; one `pnpm db:migrate` on both targets.

---

## 4. Engineering process (built for short sessions and a PRO token budget)

### GitHub as the kanban

Private repo `prabhat-shw/networth-tracker`. Projects v2 board with columns
**Backlog → Ready → In progress → In review → Done**, plus:
- **Milestones** = phases M0–M9
- **Labels** — `area:crypto|sync|ui|parser|prices|infra|security|docs`, `size:S|M|L`,
  `type:feat|fix|adr|chore`, `blocked`
- **Issue template** with: goal, acceptance criteria, files likely touched, test plan, and a
  **session budget** (S = one short session, M = one full session, L = must be split)
- One issue → one branch → one PR → `Closes #N`. Never commit to `main`.

`gh` currently lacks the `project` scope; you'll run `gh auth refresh -s project,read:project`
once (I'll prompt you). If you'd rather not, we fall back to issues + milestones only.

### Context & token framework (explicit, enforced, committed as `docs/CONTEXT.md`)

A PRO budget means context is a first-class engineering constraint. The rule is: **a fresh
session must be able to do useful work after reading ~3 small files, and must never need to
read the whole repo.** That is a design constraint on the docs *and* on the code.

**Committed memory, with hard size caps** (a CI check fails the PR if a cap is breached):

| File | Cap | Purpose | Read when |
| --- | --- | --- | --- |
| `CLAUDE.md` | 120 lines | Working agreements + conventions | Every session (auto) |
| `docs/STATE.md` | 80 lines | Handoff: where we are, what's next, gotchas | Every session |
| `docs/PLAN.md` | — | **This plan**, committed as the map | On demand |
| `docs/phases/M<N>.md` | 150 lines | Brief for one milestone: scope, files, acceptance | Only the current phase |
| `docs/decisions/NNNN-*.md` | 60 lines | One ADR = one decision + why | Only when touching that area |
| `docs/SESSION_LOG.md` | 1 line/session | Cheap history: date, issue, outcome | Rarely |

`docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/api/CONTRACT.md`, `docs/DEPLOYMENT.md` are
reference docs — linked from the phase briefs, read only when the issue touches them.

**Code layout is a context strategy too:** feature folders, files capped at ~300 lines,
colocated tests, no barrel files. If a change needs more than ~6 files open, the issue was
too big and gets split. Pure domain logic (`domain/`, `crypto/`, `parsers/`) stays free of
framework imports so a session can reason about it without loading UI context.

**The session loop** (`/start-session` and `/handoff` slash commands automate it):

1. **Open** — read `CLAUDE.md`, `docs/STATE.md`, `docs/phases/M<N>.md`, then `gh issue view N`.
   Nothing else. That's the entire warm-up.
2. **Work** — one issue, one branch. Search with `grep`/`glob`, read with line ranges, never
   `cat` a file over ~200 lines. Batch independent tool calls into one message. No subagents
   unless explicitly requested — each one re-derives context from cold and is the expensive path.
3. **Verify** — targeted tests only (`pnpm vitest run src/domain/goals`), full suite once in CI.
4. **Close** — PR with `Closes #N`, update `docs/STATE.md`, append one line to
   `docs/SESSION_LOG.md`, move the card to *In review*. **Then stop the session** — don't
   start the next issue on fumes.

**Budget discipline**
- Issue sizing is enforced at filing time: `size:S` ≤ 3 files, `size:M` ≤ 6 files,
  `size:L` **must be split before work starts**. One session = one S or M issue.
- Target ≤ ~60k tokens of context per session; if a session crosses ~75%, **write the handoff
  immediately and stop** rather than riding auto-compaction into a lossy state.
- Never paste large command output back; pipe through `head`/`tail`, use `--quiet`, use
  `gh issue view` rather than exploratory chat.
- After an edit, don't re-read the file to "verify" — the tooling already errors on failure.
- Anything discovered that a future session needs → it goes in `STATE.md` or an ADR *now*,
  not in the conversation.

**Handoff template** (`docs/STATE.md`, rewritten each session): current milestone · last
issue closed & PR · **next issue to pick up** · decisions made this session (with ADR links) ·
known gotchas / half-finished threads · exact resume command.

Conventional Commits. **No AI attribution in commits** (carrying over your paisa-diary rule).

### Testing tiers

1. **Unit (Vitest, the PR gate)** — crypto (with known-answer vectors), valuation, ownership
   share math, XIRR, amortisation, CAS parser. All pure, all fast.
2. **Component (browser mode)** — single-component real-DOM behaviour.
3. **E2E (Playwright)** — assembled flows, plus two security specs: *household B cannot read
   household A's records*, and *DB contains no plaintext*.
4. **Contract tests** — run against the API implementation; the gate for the future Rust port.

---

## 5. Roadmap

Each milestone is a handful of issues; each issue is one session.

| # | Milestone | Ships |
| --- | --- | --- |
| **M0** | Foundation | Repo, kanban board, CI, `CLAUDE.md` + docs skeleton, ADR-0001..0007, threat model, Next.js scaffold, Tailwind/shadcn, Drizzle + Postgres in Compose, health check, Vercel staging |
| **M1** | Identity & crypto core | Key hierarchy, Argon2id, WebCrypto wrappers + test vectors, lock/unlock UX, recovery kit, Better Auth + passkeys, invite-only household |
| **M2** | Encrypted sync engine | Record envelope, versioning, `pull`/`push`, tombstones, offline queue, Dexie store, contract + plaintext-scan tests |
| **M3** | Data model & manual entry | Households/members/ownership shares, accounts, holdings, transactions, liabilities, **goals + allocations**; entry forms; net-worth engine with tests |
| **M4** | Prices & valuation | Daily AMFI ingest, Yahoo equity/US/crypto, Frankfurter FX, gold; universe download; client valuation; historical timeline |
| **M5** | Dashboard, goals & insights | Net worth over time, allocation, per-owner views, **goal tagging UI, auto-tag rules, inflated targets, required SIP, Unallocated bucket**; **Insights** — contribution vs growth decomposition, XIRR/CAGR, real (inflation-adjusted) net worth, allocation drift, liquidity ladder, concentration risk, loan burn-down; **Projections** — P10/P50/P90 fan, scenario what-ifs, FI date, per-goal funding probability, sensitivity. Mobile + dense desktop |
| **M6** | Statement import | NSDL/CDSL CAS PDF (on-device), CAMS/KFin, broker + bank CSV, mapping UI, dedupe |
| **M7** | Long-tail coverage | Insurance surrender values, property, vehicles, money lent, chit funds, EPF/PPF/NPS/SSY accrual calculators, RSU/ESPP vesting |
| **M8** | Hardening & home deploy | CSP, rate limits, security review, backups + **restore drill**, Tailscale production, user guide, **v1.0** |
| **M9** | Backend v2 (learning) | Rust/Axum reimplementation of sync + price service behind the identical contract; parity proven by contract tests |

M0 starts immediately after approval; M1–M2 are the crypto backbone and deserve unhurried
sessions.

---

## 6. Verification

- `pnpm test` — unit suite, including crypto known-answer vectors and net-worth math
- `pnpm e2e` — flows plus the two security specs (cross-household isolation, DB plaintext scan)
- `pnpm test:contract` — API contract, the gate for M9
- **Manual, per milestone:** run `docker compose up`, add a joint account owned 50/50, confirm
  "My net worth" shows half and "Household" shows all; open the app on your phone over
  Tailscale and confirm the same data after sync; `psql` into the DB and confirm every value
  column is opaque
- **Restore drill (M8):** wipe the container, restore from last night's `age`-encrypted dump,
  unlock with passphrase, verify the net worth matches

## 7. First actions on approval (all of M0, one session)

1. `git init`, private GitHub repo, labels, milestones M0–M9, Projects board, M0 issues filed
2. **Commit this plan as `docs/PLAN.md`** — it is the map future sessions link to, and the
   rule is that any scope change updates it in the same PR as the ADR that caused it
3. `CLAUDE.md`, `docs/STATE.md`, `docs/CONTEXT.md`, `docs/phases/M1.md`, `docs/SESSION_LOG.md`,
   ADR-0001 (zero-knowledge architecture), `docs/SECURITY.md` threat model
4. Next.js 16 + TS strict + Tailwind v4 + shadcn scaffold, Docker Compose, CI workflow
   (typecheck · lint · unit · gitleaks · doc-size caps)
5. Stop, hand off via `docs/STATE.md`, and start M1 in a fresh session
