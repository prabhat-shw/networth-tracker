# ADR-0006 — Deployment topology: home production, Vercel staging

**Status:** Accepted · 2026-09-08

## Context

The owner does not want to trust a third-party host with production, but wants easy preview
deploys while building. Zero-knowledge (ADR-0001) means no host can read the data anyway —
but defence in depth is cheap here.

## Decision

- **Production (trusted):** Docker Compose — Next.js app + Postgres 17 + Caddy — on the
  owner's home machine/NAS, published **only on the tailnet via Tailscale**. Nothing is
  exposed to the public internet. Nightly `pg_dump | age` backups to external storage, with
  a scheduled restore drill (M8).
- **Staging (untrusted):** Vercel + Neon, `DEMO_MODE=true`, seeded synthetic household. A
  CI check fails the deploy if `DEMO_MODE` is not `true`. Real households never point here.
- One image, one migration command (`pnpm db:migrate`) for both targets.

## Consequences

- Phone access requires Tailscale on the phone — acceptable, and it doubles as auth.
- Home uptime is the owner's problem; the PWA works offline, so a down server degrades to
  read/write-locally-and-sync-later rather than an outage.
