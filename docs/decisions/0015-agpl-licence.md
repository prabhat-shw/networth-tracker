# ADR-0015 — Licence: GNU AGPL-3.0-only

**Status:** Accepted · 2026-09-26 · supersedes the licence section of [ADR-0010](0010-public-repository.md)

## Context

ADR-0010 made the repo public but deliberately deferred the licence, leaving default
copyright (readable, not reusable). Issue #14 asked the owner to choose. The product is
self-hostable and privacy-first: its value is that households run it themselves and can
audit the crypto.

## Decision

- License the code under **GNU AGPL-3.0**, SPDX `AGPL-3.0-only`. The canonical text from
  gnu.org is committed as `LICENSE`; `package.json` declares it.
- **`-only`, not `-or-later`**: the owner, not a future FSF revision, decides whether a later
  licence version applies.
- The owner is the sole copyright holder and keeps the right to relicense or dual-license.
  External contributions (none yet) would need a contributor agreement before that is
  possible; decide that when the first outside PR arrives.

## Why AGPL

- Self-hosting, modification and audit are all allowed, matching the product's promise.
- The network clause means a hosted fork (someone running it as a service) must publish its
  changes, so a closed "NetWorth as a service" cannot be built on this code.
- AGPL projects such as Ghostfolio become licence-compatible, but ideas are still preferred
  over copied code; any copied code keeps its original notices.

## Consequences

- Dependencies must stay AGPL-compatible (MIT, BSD, Apache-2.0, ISC and MPL-2.0 all are).
  Check any new licence before adding the dependency.
- Staging and the home server run unmodified code, so there is no extra publication duty.
