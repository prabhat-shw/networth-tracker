# Deployment

Two targets, with opposite levels of trust ([ADR-0006](decisions/0006-deployment-topology.md)).

| | Production (home) | Staging (Vercel) |
| --- | --- | --- |
| Who | The household | Developers, demos |
| Data | Real, encrypted | **Synthetic only** |
| Reach | Tailscale only | Public URL |
| Database | Postgres in Compose | Neon Postgres |
| `DEMO_MODE` | `false` | `true`, **enforced** |

## Production: home server

```bash
cp .env.example .env            # set POSTGRES_PASSWORD, BETTER_AUTH_SECRET, APP_ORIGIN, BIND_ADDR
GIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
curl -k https://<tailnet-host>/api/health   # {"status":"ok","app":"ok","db":"ok"}
```

Compose starts `db` → `migrate` (one-shot, applies `drizzle/`) → `app` → `caddy`
([ADR-0011](decisions/0011-database-access-and-migrations.md)). Caddy binds to `BIND_ADDR`
only; set it to the machine's Tailscale IP. Upgrade: `git pull` and repeat the `up` line.

## Staging: Vercel + Neon

One-time setup (owner, in the dashboards):

1. **Vercel → Add New → Project →** import `prabhat-shw/networth-tracker`. Framework: Next.js.
   Production branch: `main`.
2. **Storage → Neon → Create/Connect.** This injects `DATABASE_URL` into the project.
3. **Settings → Environment Variables** (Production *and* Preview):
   - `DEMO_MODE` = `true`
   - `BETTER_AUTH_SECRET` = `openssl rand -base64 32` (a staging-only value)
   - `APP_ORIGIN` = the Vercel URL
4. Redeploy, then open `/api/health`. Migrations for Neon: run
   `DATABASE_URL=<neon-url> pnpm db:migrate` locally once per schema change.

### The DEMO_MODE guard

`src/lib/deploy-guard.ts` runs from `next.config.ts`. When `VERCEL=1` (set automatically
by Vercel) and `DEMO_MODE` is anything but the exact string `true`, **the build fails**, so
nothing is deployed. When it is on, every page shows an amber "Demo environment:
synthetic data only" banner. The value is inlined at build time, so it cannot be switched
off without a new build, which would hit the guard again.

**Never point a real household at staging**, and never copy production data or secrets there.
