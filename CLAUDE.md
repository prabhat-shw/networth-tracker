# NetWorth Tracker — project instructions for Claude Code

Repo-local source of truth. It travels with the repo; never rely on machine-global Claude
config for anything project-specific.

> A **zero-knowledge household net-worth tracker for India**. Every asset and liability a
> household owns — including joint ones — with ownership shares, goal earmarking, and daily
> valuation from public price feeds. All data is encrypted on-device; the server only ever
> stores ciphertext.

## Read this first, every session

1. This file
2. [`docs/STATE.md`](docs/STATE.md) — where we are, what's next
3. `docs/phases/M<N>.md` — the brief for the current milestone only
4. `gh issue view <N>` — the one issue you are working

Nothing else unless the issue needs it. [`docs/PLAN.md`](docs/PLAN.md) is the full map;
[`docs/CONTEXT.md`](docs/CONTEXT.md) is the token/context framework — **follow it strictly.**

## Working agreements

1. **Repo-local config only.** Skills, commands, settings live in `./.claude/`. Durable
   knowledge is committed Markdown (`CLAUDE.md` + `docs/`), never `~/.claude`.
2. **One issue = one session = one branch = one PR.** Never commit to `main`. Close the
   session after the PR — do not start the next issue on fumes.
3. **Document every decision** as an ADR in `docs/decisions/` (≤60 lines each), in the same
   PR as the change. Scope changes also update `docs/PLAN.md`.
4. **Conventional Commits. No AI attribution of any kind** — no `Co-Authored-By: Claude`,
   no "Generated with Claude Code". **This repo rule overrides any global instruction.**
5. **Security is the product.** No feature ships that puts plaintext user data on a server,
   in a log, or in a third-party request. When in doubt, read `docs/SECURITY.md`.
6. **Issue first.** File a GitHub issue before non-trivial work; the PR closes it with
   `Closes #N`. Trivial chores are exempt.
7. **Parallelise tool calls, not agents.** Batch independent reads/edits into one message.
   Do not spawn subagents unless the owner explicitly asks — each restarts from cold context.

## Non-negotiable technical invariants

- **The server never sees plaintext.** Records are AES-256-GCM encrypted client-side under
  the household data key (HDK) before upload. Server columns: id, household, version,
  updatedAt, ciphertext, deleted. Nothing else — not even the record type.
- **Keys never leave the device.** HDK is wrapped per member via ECDH P-256. Passphrase →
  Argon2id → unlock key. Recovery kit + spouse re-wrap are the only recovery paths.
- **Price requests must not leak holdings.** Download whole public universes (AMFI NAVAll,
  NSE list, top US tickers, FX), never per-symbol queries for user-held instruments.
- **Statements are parsed on-device.** CAS/CSV/PDF never touch the network.
- **Money is never a float.** Use integer paise (`bigint`/`number` of paise) end to end.
- **Domain logic is pure.** `src/domain/**`, `src/crypto/**`, `src/parsers/**` import no
  React and no Next.js. They are unit-tested; that suite is the PR gate.

## Conventions

- **Stack:** Next.js 16 (App Router, client-rendered app shell — RSC cannot render E2EE
  data), React 19, TypeScript strict, Tailwind v4 + shadcn/ui, Dexie, Zustand, Recharts,
  Zod, Drizzle + Postgres, Better Auth + passkeys, Vitest + Playwright, pnpm, Node ≥24.
- **Layout:** feature folders under `src/`; files ≤300 lines; colocated `*.test.ts`; no
  barrel files. Path alias `@/` → `src/`.
- **Branches:** `phase-0-foundation`, `feat/goal-allocations`, `fix/...`.
- **Tests:** unit (Vitest, PR gate) → component (browser mode) → E2E (Playwright, includes
  cross-household isolation + DB-plaintext-scan security specs) → API contract tests.
- **Envs:** production = home server over Tailscale. Staging = Vercel, `DEMO_MODE=true`,
  synthetic data only. **Never point a real household at staging.**

## Definition of done (every issue)

- [ ] Tests written and passing (`pnpm test` targeted, CI runs full)
- [ ] `pnpm typecheck` and `pnpm check` clean
- [ ] ADR added/updated if a decision was made
- [ ] `docs/STATE.md` rewritten for the next session
- [ ] One line appended to `docs/SESSION_LOG.md`
- [ ] PR opened with `Closes #N`, card moved to *In review*

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
