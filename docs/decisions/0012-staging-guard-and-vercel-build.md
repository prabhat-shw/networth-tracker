# ADR-0012 — Staging guard at build time, and how Vercel builds differ

**Status:** Accepted · 2026-09-26 · refines [ADR-0006](0006-deployment-topology.md)

## Context

ADR-0006 said "a CI check fails the deploy if `DEMO_MODE` is not `true`". But Vercel
deploys from its own builder, not our CI, so a GitHub Actions check could not stop a Vercel
deploy. The first real deploy then showed that Next 16.3's `output: "standalone"` (needed for
Docker) crashes Vercel's builder with `ENOENT .next/next-server.js.nft.json`
([vercel/next.js#96646](https://github.com/vercel/next.js/issues/96646)).

## Decision

- **The guard lives in the build itself.** `next.config.ts` calls `assertDeploySafe`
  (`src/lib/deploy-guard.ts`): when `VERCEL=1` and `DEMO_MODE` is not exactly `"true"`,
  `next build` throws. Whatever triggers the deploy, no build means nothing is deployed.
- **The banner is inlined at build** (`NEXT_PUBLIC_DEMO_MODE`), so it cannot be switched off
  at runtime without a rebuild, which would hit the guard.
- **Standalone output only off Vercel:** `output: isStaging(env) ? undefined : "standalone"`.
  Docker keeps standalone; Vercel uses its native output.
- **Staging migrations are manual** (`pnpm db:migrate` against Neon's unpooled URL, from a
  dev machine; `docs/DEPLOYMENT.md` S4). Home runs them automatically (ADR-0011).
- **Staging URL:** `networth-staging.vercel.app`. `networth-tracker.vercel.app` is owned by
  another account; `.vercel.app` names are global.

## Consequences

- Staging detection relies on Vercel setting `VERCEL=1`, which it does for every build.
- The standalone switch can be removed once Next ships the fix (16.3.5+), keeping one path.
- A schema PR can reach staging before its migration is applied, so health checks show it.
  Apply the migration first; revisit automation (e.g. a CI job with a Neon secret) in M2.
