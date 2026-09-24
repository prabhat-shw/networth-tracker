# Changelog

All notable changes are recorded here. Format follows [Keep a Changelog]; the project uses
semantic versioning (see ADR-0009). Entries are written from Conventional Commit subjects.

## [Unreleased]

### Added
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
- Docker image builds from a Windows checkout: added `.dockerignore` and `public/`.

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
