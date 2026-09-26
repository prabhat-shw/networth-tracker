# ADR-0020 — Auth: Better Auth, passkeys + SMTP email OTP, invite-only

**Status:** Accepted · 2026-09-26 · implements the auth half of [ADR-0001](0001-zero-knowledge-architecture.md)

## Context

Issue #6 (split into #6, #37, #38 because it exceeded one session). Auth decides who may
*sync ciphertext*; it never touches data keys. A household app has 2–4 users, so there must
be no public sign-up, and a leaked database must not yield reusable credentials.

## Decision

- **Better Auth 1.7** (`src/server/auth.ts`) with the drizzle adapter, `emailOTP` and
  `@better-auth/passkey` plugins. **No passwords, no social logins** (`emailAndPassword`
  off). Telemetry explicitly off. Ids are UUIDs so `household_members.member_id` can FK to
  `user.id` (#37).
- **Sign-in:** passkey, or a 6-digit email code (5 min, 3 attempts, stored hashed).
  Passkeys are added from a signed-in session (the plugin default).
- **Invite-only:** `invites` holds **SHA-256(NFKC-lowercased email)**, 14-day expiry,
  single use. A `user.create.before` hook refuses any account without an open invite (403),
  whatever path created it; `after` consumes the invite. Uninvited addresses get the same
  200 from the send-code endpoint but **no mail**, so it does not reveal who is registered
  or mail-bomb strangers. The first owner is invited with `pnpm auth:invite <email>`; in-app
  invites for a spouse arrive with the key relay (#38).
- **Mail = SMTP via nodemailer** (MIT-0), env-configured. Missing SMTP config fails the send
  loudly. On staging (`DEMO_MODE`) every code goes to `SMTP_DEMO_TO`, or nowhere.
- **Cookies:** `httpOnly`, `SameSite=Lax`, `Secure` + `__Secure-` prefix whenever the origin
  is https (always, in production and staging). `trustedOrigins` = `APP_ORIGIN` only.
- **Rate limits** (per IP, stored in Postgres so they survive restarts and serverless):
  default 30/min; send code 3 / 5 min; verify code 5 / 5 min; passkey verify 10/min.
- **Schema:** Better Auth's tables written by hand in Drizzle; a test asserts they match
  `getAuthTables()` field-for-field, so a Better Auth upgrade that adds a field fails CI.

## Consequences

- Auth tables hold readable account data: email, name, session IP and user agent, passkey
  public keys. None of it is financial; SECURITY.md records it as accepted.
- SHA-256 of an email is guessable by dictionary; the hash avoids *storing* invitee
  addresses, it is not a secret.
- Staging needs migration `0002_auth` (manual, DEPLOYMENT S4) and, for codes, SMTP env.
- The API contract (`docs/api/CONTRACT.md`) lists the auth routes; household routes are #37/#38.
