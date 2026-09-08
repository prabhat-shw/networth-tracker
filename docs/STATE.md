# State — read me first

_Last updated: 2026-09-08 · session 1_

## Where we are

**Milestone:** M0 — Foundation (mostly done)

Shipped this session:
- Next.js 16 + React 19 + TS strict + Tailwind v4 + Biome scaffold (`pnpm dev` works)
- `src/domain/money.ts` — integer-paise money with Indian formatting (₹12,34,567 / ₹12.35 L), 7 unit tests
- Docker Compose (app + Postgres 17 + Caddy), Dockerfile (standalone), Caddyfile, `.env.example`
- CI: doc-size caps, typecheck, Biome, Vitest, gitleaks, osv-scanner
- Docs: PLAN, ARCHITECTURE, SECURITY threat model, CONTEXT (session framework), M1 brief,
  API contract draft, ADRs 0001–0007; issue/PR templates; `/start-session` + `/handoff`
- GitHub: private repo, labels, milestones M0–M9, issues #1–#7

Verified green: `pnpm test` (7 passing) · `pnpm typecheck` · `pnpm check` · `pnpm check:docs`

## Next session picks up

**Issue #1 — Drizzle + Postgres wiring and health check** (`size:M`, milestone M0).
It unblocks all of M1. Then #2 (Vercel staging), then M1 starting at #3 (crypto primitives).

M1 is the crypto backbone: one issue per session, test vectors before UI.

## Gotchas / open threads

- **Owner action:** `gh auth refresh -s project,read:project` — the Projects board could not be
  created without it. Milestones + labels are the board until then.
- `LayoutProps` (Next 16 generated types) is avoided in `src/app/layout.tsx` so `tsc --noEmit`
  passes on a clean checkout without running `next build` first.
- Issue #7 (lock/unlock UX) is blocked on `docs/UX.md` — the UX spec is being designed and
  needs the owner's review before that screen is built.
- Money is integer **paise** everywhere. Use `src/domain/money.ts`; never introduce a float.

## Resume command

```
cd D:/Work/claude-apps/networth-tracker && gh issue view 1
```
