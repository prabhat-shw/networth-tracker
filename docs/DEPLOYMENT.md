# Deployment

Two targets, with opposite levels of trust ([ADR-0006](decisions/0006-deployment-topology.md)).

| | Production (home) | Staging (Vercel) |
| --- | --- | --- |
| Who | The household | Developers, demos |
| Data | Real, encrypted | **Synthetic only** |
| Reach | Tailscale only | Public URL |
| Database | Postgres in Compose | Neon Postgres |
| Migrations | Automatic (`migrate` service) | **Manual**, from a dev machine (S4) |
| `DEMO_MODE` | `false` | `true`, **enforced by the build** |

Dashboard labels below are as of September 2026. Vercel and Neon rename buttons from time to
time; if one is missing, look for the nearest equivalent and fix this file in your next PR.

---

## Production: home server

### Prerequisites

- A machine that stays on, with **Docker Desktop** (Windows/macOS) or Docker Engine (Linux)
  running. On Windows, start Docker Desktop and wait until `docker info` prints a version.
- **Tailscale** installed and logged in on that machine and on every device that will use the app.
- The repo cloned, and once per clone: `git config core.hooksPath .githooks`.

### H1. Create `.env`

1. In the repo folder, copy the template:
   - PowerShell: `Copy-Item .env.example .env`
   - bash: `cp .env.example .env`
2. Open `.env` in an editor and set:

| Key | Value |
| --- | --- |
| `POSTGRES_PASSWORD` | A long random value (command below). Also update it inside `DATABASE_URL` |
| `BETTER_AUTH_SECRET` | A different long random value |
| `APP_ORIGIN` | `https://<machine>.<tailnet>.ts.net`, from `tailscale status` or the Tailscale admin console |
| `BIND_ADDR` | The machine's Tailscale IP, from `tailscale ip -4` (e.g. `100.x.y.z`). **Never `0.0.0.0`** |
| `DEMO_MODE` | `false` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Mail server for sign-in codes (ADR-0020). Gmail: `smtp.gmail.com`, `465`, your address, an [app password](https://myaccount.google.com/apppasswords) |

Random value, PowerShell:
`[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`
(bash: `openssl rand -base64 32`). `.env` is git-ignored and Docker-ignored; never commit it.

### H2. Start the stack

```bash
GIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
```

PowerShell equivalent:

```powershell
$env:GIT_SHA = git rev-parse --short HEAD; docker compose up -d --build
```

Compose starts, in order: `db` (waits until healthy) → `migrate` (applies `drizzle/`, then
exits 0) → `app` → `caddy` ([ADR-0011](decisions/0011-database-access-and-migrations.md)).
The first build takes a few minutes.

### H3. Verify

```bash
docker compose ps -a                 # db healthy, migrate "Exited (0)", app + caddy "Up"
docker compose logs migrate          # ends without an error
curl -k https://<tailnet-host>/api/health
```

Expected: `{"status":"ok","app":"ok","db":"ok"}` with HTTP 200. A `503` with `"db":"down"`
means the app cannot reach Postgres: check `docker compose logs db`.

**First owner (once):** registration is invite-only (ADR-0020). Invite yourself, then sign
in with an emailed code and add a passkey:

```bash
docker compose run --rm migrate pnpm auth:invite you@example.com
```

### H4. Upgrade

```bash
git switch main && git pull
GIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
```

New migrations apply automatically on the way up. Data lives in the `db-data` volume;
**never run `docker compose down -v` on the real stack**, because `-v` deletes it.

---

## Staging: Vercel + Neon

Live at <https://networth-staging.vercel.app> (Vercel project `networth-tracker-pxac`,
Neon database in Singapore). The first import created a duplicate project; see S1 step 4.

One-time setup by the owner, in the browser. About 20 minutes. Do the steps in order; each
ends with a check.

### S1. Import the repo into Vercel

1. Open <https://vercel.com/new>. Sign in with **Continue with GitHub**.
2. Under **Import Git Repository**, find `networth-tracker` and click **Import**.
3. If the repo is not listed:
   1. Click **Adjust GitHub App Permissions** (GitHub opens).
   2. Under **Repository access**, choose **Only select repositories**.
   3. Pick `networth-tracker` and click **Save**. GitHub returns you to Vercel.
   4. Click **Import** next to the repo.
4. **Import once.** If the first deploy fails, fix it and use **Deployments → ⋯ → Redeploy**.
   Going back to `/new` and importing again creates a second project that also builds every
   push and PR (this happened once; the duplicate had to be deleted).

**Check:** you are on the **New Project / Configure Project** screen.

### S2. Configure the project (before the first Deploy)

1. **Project Name:** anything (Vercel may suggest one with a suffix, e.g. `networth-tracker-pxac`).
   It becomes the default URL `https://<project-name>.vercel.app`; a cleaner one is set in S5.
2. **Framework Preset:** Next.js (auto-detected). **Root Directory:** `./`.
3. **Build and Output Settings:** leave every field on its default.
4. Expand **Environment Variables**. Vercel **pre-fills rows from `.env.example`**: placeholders
   such as `POSTGRES_PASSWORD=change-me` and `DATABASE_URL=postgres://…@localhost…`.
   Before adding anything:
   - **Remove** the rows `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `BIND_ADDR`,
     and `DATABASE_URL` (Neon provides the real one in S3; if it is left here, S3 fails with
     *"already has an existing environment variable with name DATABASE_URL"*).
5. Make sure these four rows exist with exactly these values (edit pre-filled ones, add the rest):

| Key | Value | Why |
| --- | --- | --- |
| `DEMO_MODE` | `true` | The build refuses to run on Vercel otherwise (see *The DEMO_MODE guard*) |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | Vercel does not know pnpm 11 and falls back to pnpm 9, which cannot read `pnpm-workspace.yaml`. Corepack uses `packageManager` from `package.json` |
| `BETTER_AUTH_SECRET` | a fresh random value | Staging-only. **Never** the home value; never `change-me` |
| `APP_ORIGIN` | `https://<project-name>.vercel.app` | Corrected in S5 if the final URL differs |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | a test mailbox | Sign-in codes. Optional: without them no code is sent |
| `SMTP_DEMO_TO` | your test inbox | Every staging code goes here, whoever it is for |

   Generate the secret in PowerShell and paste it straight into the field (not into chat or a file):
   `[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`

6. Click **Deploy** and wait for the build (about 1 to 2 minutes).

**Check:** the deployment finishes with a screenshot of the page and **Continue to Dashboard**.
Opening `https://<project-name>.vercel.app/api/health` gives **503** `{"db":"down"}`. That is
expected: there is no database yet.

**If the build fails:**
- `Refusing to build: this is Vercel staging and DEMO_MODE is not 'true'` → fix `DEMO_MODE`
  (**Settings → Environment Variables**), then **Deployments → ⋯ → Redeploy**.
- `ENOENT … next-server.js.nft.json` → you are on a commit before PR #20; redeploy from latest `main`.
- pnpm / `pnpm-workspace.yaml` / lockfile errors → `ENABLE_EXPERIMENTAL_COREPACK=1` is missing.

### S3. Create and connect the Neon database

1. Open the project in Vercel → **Storage** tab → **Create Database**.
2. Choose **Neon** (Serverless Postgres) → **Continue**.
3. **Install Neon** dialog: if asked, choose **Create New Neon Account** and accept the terms.
4. **Region:** Singapore (`aws-ap-southeast-1`), or whichever listed region is closest to India.
   **Plan:** Free. Click **Continue**.
5. **Database name:** e.g. `networth-staging` → **Create**.
6. The **Install Integration → Connect a Project** dialog appears. Set every field:

| Field | Set to | Why |
| --- | --- | --- |
| **Project** | your Vercel project | |
| **Environments** | **Production, Preview** | Development is not needed |
| **Create database branch for deployment** → Production | **unticked** | Branches start empty, without the migrated tables |
| **Create database branch for deployment** → Preview | **unticked** | Same |
| **Custom Prefix** | **`DATABASE`** (replace the default `STORAGE`) | The app reads `DATABASE_URL`. `STORAGE` would give `STORAGE_URL` and health stays 503 |
| **Sensitive** | **on** | Vercel never shows the value again; S4 reads it from Neon |

7. Click **Connect**.

**If you see** *"This project already has an existing environment variable with name
DATABASE_URL"*: click **Skip** / close the dialog, go to **Settings → Environment Variables**,
delete the placeholder `DATABASE_URL` (value contains `localhost`), then **Storage → your
database → Connect Project** and repeat step 6.

**Check:** **Settings → Environment Variables** now lists `DATABASE_URL`,
`DATABASE_URL_UNPOOLED`, several `PG…` entries and Neon's own `POSTGRES_…` entries (long
real values). None of the rows should hold `change-me`, `localhost`, or `networth`.

8. **Match the regions:** **Settings → Functions → Function Region** → pick the same region as
   Neon (Singapore = `sin1`) → **Save**. Otherwise every query crosses continents.

### S4. Create the tables (run migrations)

Run from your own machine against Neon. Repeat this **every time a new file appears in
`drizzle/`**, before or right after merging the PR that adds it.

1. Vercel → **Storage** → click the Neon database → **Open in Neon** (top right). The Neon
   console opens, already signed in.
2. On the Neon project dashboard, click **Connect** (top right).
3. In **Connect to your database**, leave **Branch**, **Database** and **Role** as they are.
4. Turn **Connection pooling** **off**. The host in the string must **not** contain
   `-pooler`. Migrations need a direct connection.
5. Click **Show password**, then the **copy** icon. Paste into Notepad. It looks like:
   ```
   postgresql://neondb_owner:AbC123xyz@ep-name-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
6. **Delete `&channel_binding=require`** from the end; keep `?sslmode=require`. (postgres.js
   forwards unknown URL parameters to the server, which may reject this one.)
7. Open PowerShell and run one line at a time:
   ```powershell
   cd D:\Work\claude-apps\networth-tracker
   git switch main
   git pull
   $env:DATABASE_URL = "postgresql://...neon.tech/neondb?sslmode=require"
   pnpm db:migrate
   Remove-Item Env:DATABASE_URL
   ```
   Put your edited string between the quotes on the `$env:DATABASE_URL` line. Never paste it
   into chat, an issue, or a commit.

**Check:** `pnpm db:migrate` ends with `migrations applied successfully` and no red error.
In Neon, **Tables** (left sidebar) shows `records` with 6 columns: `id`, `household_id`,
`version`, `updated_at`, `ciphertext`, `deleted`.

**If it fails:**
- `password authentication failed` → you copied before clicking **Show password**.
- `unrecognized configuration parameter "channel_binding"` → step 6 was skipped.
- `ENOTFOUND` / timeout → the string is incomplete; copy it again.

### S5. Choose the domain, set APP_ORIGIN and redeploy

1. **Settings → Domains → Add Domain** → `networth-staging.vercel.app` (ours) → **Add**.
   - `.vercel.app` names are unique across **all** Vercel accounts. *"Cannot add … since it's
     already assigned to another project"* means someone else owns it (`networth-tracker.vercel.app`
     is taken). Pick another name.
   - Check a name first: `curl -sI https://<name>.vercel.app | grep -i x-vercel-error`. Output
     `DEPLOYMENT_NOT_FOUND` means nobody serves it (likely free); a page means it is taken.
   - Asked what to do with the old suffixed domain: **Redirect** (308) is safest; removing it
     is also fine, since nothing depends on it.
2. **Settings → Environment Variables** → `APP_ORIGIN` → **⋯ → Edit** → set
   `https://<that domain>` (no trailing slash) → **Save**.
3. **Deployments** → the top (latest) deployment → **⋯** → **Redeploy** → confirm.
   Environment changes only reach **new** deployments.

### S6. Verify

1. `https://<domain>/api/health` → `{"status":"ok","app":"ok","db":"ok"}` (HTTP 200).
2. `https://<domain>/` → an amber bar at the top: *"Demo environment: synthetic data only.
   Never enter real financial information here."*
3. Optional guard test: set `DEMO_MODE` to `false` → Redeploy → the build must fail with
   *"Refusing to build"*. Set it back to `true` → Redeploy.

### S6a. Invite yourself (first owner, once)

Registration is invite-only (ADR-0020), and nobody exists yet to invite you from the app.
Without this step, sign-in says *"a code is on its way"* but **no code is ever sent**. That
message is deliberately the same for every address.

1. Copy Neon's **unpooled** connection string exactly as in S4 steps 1–6.
2. In PowerShell, one line at a time:
   ```powershell
   cd D:\Work\claude-apps
etworth-tracker
   $env:DATABASE_URL = "postgresql://...neon.tech/neondb?sslmode=require"
   pnpm auth:invite you@example.com
   Remove-Item Env:DATABASE_URL
   ```
   The invite lasts 14 days. Only the SHA-256 of the address is stored.
3. On `https://<domain>/`, sign in with that address. **On staging the code goes to
   `SMTP_DEMO_TO`, not the address you typed** (check its spam folder too).

Everyone after you (a spouse) is invited from the app's Household panel (#64), not here.

**If no code arrives**, in this order:
- Wrong inbox: it's `SMTP_DEMO_TO`.
- `SMTP_DEMO_TO` missing: staging then sends nothing. Add it, then **Redeploy**.
- Not invited, or the invite has expired: redo step 2.
- Rate limit: 3 requests per 5 minutes per IP; wait and retry.
- Mail server error: **Logs** → filter `/api/auth/email-otp/send-verification-otp` →
  `Failed to run background task` (usually the Gmail app password, or `SMTP_PORT` 465 vs 587).

### S7. Leave these settings alone

- **Settings → Deployment Protection → Vercel Authentication**: keep it on for previews.
- Every PR gets a preview deployment and a Vercel status on GitHub. It is **not** a required
  check, so it never blocks a merge.
- Vercel redeploys production automatically on every merge to `main`.

---

## How Vercel builds differ from the home build

`next.config.ts` sees `VERCEL=1` and skips `output: "standalone"`. Docker needs standalone,
but on Next 16.3 it stops emitting `next-server.js.nft.json`, which Vercel's builder reads,
and the build crashes with `ENOENT` ([vercel/next.js#96646](https://github.com/vercel/next.js/issues/96646)).

## The DEMO_MODE guard

`src/lib/deploy-guard.ts` runs from `next.config.ts`. When `VERCEL=1` (set automatically
by Vercel) and `DEMO_MODE` is anything but the exact string `true`, **the build fails**, so
nothing is deployed. When it is on, every page shows the amber demo banner. The value is
inlined at build time, so it cannot be switched off without a new build, which would hit
the guard again.

**Never point a real household at staging**, and never copy production data or secrets there.
