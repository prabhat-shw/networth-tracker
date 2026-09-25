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

One-time setup by the owner, in the dashboards. Takes about 15 minutes. Do the steps in order.

### 1. Import the repo

1. Open <https://vercel.com/new> and sign in with GitHub.
2. Under **Import Git Repository**, pick `networth-tracker` and click **Import**. If it is not
   listed: **Adjust GitHub App Permissions → Only select repositories → `networth-tracker` → Save**.

### 2. Configure (before the first Deploy)

- **Project Name:** `networth-staging` · **Framework Preset:** Next.js · **Root Directory:** `./`
- **Build and Output Settings:** leave the defaults.
- **Environment Variables:**

| Key | Value | Why |
| --- | --- | --- |
| `DEMO_MODE` | `true` | Required, or the build refuses to run (see the guard below) |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | Vercel does not know pnpm 11 and falls back to pnpm 9, which cannot read `pnpm-workspace.yaml`. Corepack uses `packageManager` from `package.json` instead |
| `BETTER_AUTH_SECRET` | a fresh random value | Staging-only. Never reuse the home value |
| `APP_ORIGIN` | `https://networth-staging.vercel.app` | Corrected in step 5 if the URL differs |

Generate the secret in PowerShell:
`[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`

Click **Deploy**. The site shows the demo banner; `/api/health` returns 503 until step 3.

### 3. Attach Neon

1. Project → **Storage → Create Database → Neon → Continue**.
2. **Region:** Singapore, or the region closest to India. **Plan:** Free. **Name:** `networth-staging`.
3. Leave the env var **prefix empty**, so the app gets `DATABASE_URL`.
4. **Environments:** Production and Preview. Leave preview branching off. Click **Connect**.
   This adds `DATABASE_URL` (pooled, used by the app) and `DATABASE_URL_UNPOOLED` (direct).
5. **Settings → Functions → Function Region:** the same region as Neon (Singapore = `sin1`).

### 4. Run migrations (from a dev machine, once per new migration)

Copy `DATABASE_URL_UNPOOLED` from **Storage → database → .env.local → Show secret**, then:

```powershell
$env:DATABASE_URL = "<unpooled url>"
pnpm db:migrate
Remove-Item Env:DATABASE_URL
```

### 5. Fix APP_ORIGIN and redeploy

Check the real URL under **Settings → Domains**; update `APP_ORIGIN` under **Settings →
Environment Variables** if it differs. Then **Deployments → latest → ⋯ → Redeploy**; env
changes apply only to new deployments.

### 6. Verify

- `https://<url>/api/health` returns `{"status":"ok","app":"ok","db":"ok"}`.
- Every page shows the amber "Demo environment" banner.
- Optional: set `DEMO_MODE=false` and redeploy. The build must fail with "Refusing to build".
  Set it back to `true`.

Keep **Settings → Deployment Protection → Vercel Authentication** on for previews. Each PR
gets a preview deployment; it is not a required check, so it never blocks a merge.

### How Vercel builds differ from the home build

`next.config.ts` sees `VERCEL=1` and skips `output: "standalone"`. Docker needs standalone,
but on Next 16.3 it stops emitting `next-server.js.nft.json`, which Vercel's builder reads,
and the build crashes with `ENOENT` ([vercel/next.js#96646](https://github.com/vercel/next.js/issues/96646)).

### The DEMO_MODE guard

`src/lib/deploy-guard.ts` runs from `next.config.ts`. When `VERCEL=1` (set automatically
by Vercel) and `DEMO_MODE` is anything but the exact string `true`, **the build fails**, so
nothing is deployed. When it is on, every page shows an amber "Demo environment:
synthetic data only" banner. The value is inlined at build time, so it cannot be switched
off without a new build, which would hit the guard again.

**Never point a real household at staging**, and never copy production data or secrets there.
