# Changelog

All notable changes are recorded here. Format follows [Keep a Changelog]; the project uses
semantic versioning (see ADR-0009). Entries are written from Conventional Commit subjects.

## [Unreleased]

### Added
- UX design spec and clickable prototype covering the nine core screens, the add-anything
  flow, and the ownership-lens/goal-allocation mechanics.
- Build identity: `/api/version`, in-app build badge, and an update banner that offers a
  reload when the server is serving a newer build (ADR-0009).
- Branch-based workflow: ADR-0008, pre-push hook blocking direct pushes to `main`.
- Foundation: Next.js 16 + TypeScript strict + Tailwind v4 + Biome scaffold, integer-paise
  money module with Indian formatting, Docker Compose (app + Postgres + Caddy), CI
  (doc caps, typecheck, lint, tests, gitleaks, dependency audit).
- Docs: plan, architecture, threat model, session/context framework, ADRs 0001–0009.

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
