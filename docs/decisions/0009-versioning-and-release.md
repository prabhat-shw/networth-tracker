# ADR-0009 — Versioning and knowing which build is served

**Status:** Accepted · 2026-09-08

## Context

The app is an offline-first PWA deployed to a home server. Both facts make "which build am I
actually looking at?" a real question: a service worker will happily serve a cached bundle
long after a deploy, and the owner needs to confirm a fix reached their phone before
trusting a number on the screen.

## Decision

**Build identity** = `version` (semver from `package.json`) + short **git SHA** + build
timestamp, baked in at build time by `next.config.ts` as `NEXT_PUBLIC_*` constants and
exposed through `src/lib/version.ts`.

- `GET /api/version` returns that identity, `no-store`. It is the ground truth for what the
  *server* is serving.
- `UpdateBanner` polls it every 5 minutes and on tab focus; when the served SHA differs from
  the running one, it offers a reload. Comparison is on **SHA, not version** — a hotfix may
  ship without a semver bump, and only the SHA identifies a build uniquely.
- `BuildBadge` stamps the version + SHA in the UI, so the answer is always one glance away.
- Docker receives the SHA as a build arg (`GIT_SHA`), because `.git` is not in the build
  context.

**Release policy:** semver. `0.x` while pre-v1. A milestone completing bumps the minor
version, tags `vX.Y.Z`, and adds a `CHANGELOG.md` entry generated from Conventional Commits.
`main` is always deployable; the tag is what the home server deploys.

## Consequences

- Every bug report can carry an exact build, and "did my deploy land?" is answerable without
  SSH.
- The banner is the only correct place to handle service-worker updates when the PWA lands
  in M8 — it will switch from polling `/api/version` to the SW `updatefound` event, keeping
  the same UI.
- Dev builds report `sha: "unknown"` and the banner stays silent, so local work is unaffected.
