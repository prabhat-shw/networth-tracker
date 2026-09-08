# State — read me first

_Last updated: 2026-09-08 · session 1_

## Where we are

**Milestone:** M0 — Foundation (in progress)

Repo scaffolded: Next.js 16 + TS strict + Tailwind v4 + Biome, docs skeleton, ADRs 0001–0007,
threat model, Docker Compose (app + Postgres + Caddy), CI workflow, GitHub kanban.

## Next session picks up

**M1 — Identity & crypto core.** Brief: [`docs/phases/M1.md`](phases/M1.md).
Start with the first open issue in milestone M1 (`gh issue list -m M1 -s open`).

M1 is the crypto backbone — take it slowly, one issue per session, and write known-answer
test vectors before wiring any UI.

## Gotchas / open threads

- `gh` needs the `project` scope for the Projects board: `gh auth refresh -s project,read:project`.
  Until then, milestones + labels are the board.
- Staging on Vercel is not provisioned yet (M0 issue). It must ship with `DEMO_MODE=true`.
- Money is integer **paise** everywhere. No floats. Decide the paise helper's home in M3.

## Resume command

```
cd D:/Work/claude-apps/networth-tracker && gh issue list -m M1 -s open
```
