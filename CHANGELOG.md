# Changelog

All notable changes are recorded here. Format follows [Keep a Changelog]; the project uses
semantic versioning (see ADR-0009). Entries are written from Conventional Commit subjects.

## [Unreleased]

### Added
- Household panel (M1, #64): invite a member by email, see pending and ready invites, and
  add a member only after comparing security codes; a mismatch cancels the invite.
- Joining a household (M1, #52, #63): the invitee waits with their code shown, then confirms
  the inviter's code before the household opens; cancel and decline an invite.
- Sign-in and first run (M1, #53-#55): email code sign-in (invite-only), passphrase, 24-word
  recovery kit (PDF/print), and a household created on first run.
- Lock and unlock (M1, #49, #54): passphrase unlock, auto-lock after inactivity, restore with
  the recovery kit from the unlock screen.
- Crypto core (M1): Argon2id, AES-256-GCM, ECDH P-256 key wraps, identity vault, household
  key with per-member wraps; server relays hold ciphertext and public keys only.
- Staging guard: Vercel builds fail unless `DEMO_MODE=true`; a demo banner shows on
  every page when it is on. `docs/DEPLOYMENT.md` covers home and staging.
- Database: Drizzle + Postgres, the ciphertext-only `records` sync table, `pnpm db:generate`
  / `db:migrate`, a one-shot Compose `migrate` service, and `/api/health` (ADR-0011).
- Build identity: `/api/version`, in-app build badge, and an update banner that offers a
  reload when the server is serving a newer build (ADR-0009).
- Branch-based workflow: ADR-0008, pre-push hook blocking direct pushes to `main`.
- Foundation: Next.js 16 + TypeScript strict + Tailwind v4 + Biome scaffold, integer-paise
  money module with Indian formatting, Docker Compose (app + Postgres + Caddy), CI
  (doc caps, typecheck, lint, tests, gitleaks, dependency audit).
- Docs: plan, architecture, threat model, session/context framework, ADRs 0001–0009.

### Fixed
- Vercel builds: skip standalone output there (Next 16.3 `next-server.js.nft.json` ENOENT).
- Docker image builds from a Windows checkout: added `.dockerignore` and `public/`.

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
