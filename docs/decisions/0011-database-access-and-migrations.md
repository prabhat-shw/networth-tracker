# ADR-0011 — Database access, schema shape and migrations

**Status:** Accepted · 2026-09-25

## Context

M1 auth needs Postgres. The sync table (ADR-0003) must be physically unable to hold
plaintext, migrations must run on the home server without a human at a psql prompt, and a
health check must not become an information leak.

## Decision

- **Driver:** Drizzle ORM over `postgres` (postgres.js). Pure JS, no native build step, and
  the Drizzle adapter Better Auth supports. The client (`src/server/db/client.ts`) connects
  lazily so `next build` never needs a database.
- **Schema:** one `records` table: `id uuid`, `household_id uuid`, `version bigint`,
  `updated_at timestamptz`, `ciphertext bytea`, `deleted boolean`. Ciphertext is raw
  `bytea` (no base64 text column that invites "just one readable field"). A unit test pins
  the exact column set and fails on any text/char/json/numeric/enum column.
- **Migrations:** `drizzle-kit generate` produces SQL committed under `drizzle/`, reviewed
  in the PR like code. In Compose, a one-shot `migrate` service (built from the `build`
  stage) runs `pnpm db:migrate`; `app` waits for `service_completed_successfully`. The
  runtime image stays standalone and carries no migration tooling.
- **Health:** `GET /api/health` returns `200 {status, app, db}` when the DB answers
  `select 1` within 2 s, otherwise `503` with `db: "down"`. The body holds status words
  only; driver errors are swallowed because they can echo the connection string.

## Consequences

- No foreign key from `records` to a households table yet; that arrives with M1 (#5).
- A bad migration blocks app start instead of half-applying at runtime, which is the
  failure we want at home.
- `.dockerignore` now keeps the host `node_modules`, `.env` and `.git` out of the build
  context. Without it the image built on Windows was broken and `.env` could reach a layer.
