# ADR-0028 — Tests use the lowest allowed Argon2id params

**Status:** Accepted · 2026-09-27 · issue #58 (owner approved) · refines [ADR-0002](0002-key-hierarchy-and-sharing.md), [ADR-0022](0022-identity-vault-relay.md)

## Context

Every identity create, unlock, passphrase change or restore runs Argon2id at ADR-0002's
64 MiB, t=3 (~0.3–0.5 s each). Vault, first-run and restore tests chain up to six of them,
so the test step on CI grew from ~10 s to ~22 s, and under load CPU-bound tests hit the
5 s timeout. `never repeats an IV across 10k seals` failed about 1 run in 3 locally.

## Decision

- **A Vitest setup file** (`src/test/fast-kdf.ts`, both projects) mocks `@/crypto/kdf` so
  new passphrase wraps use the `KDF_BOUNDS` floor: 19 MiB, t=2. The code path is the
  real one; only the numbers change. `deriveUnlockKey`'s default params are supplied by
  the mock, because a mock can't reach kdf.ts's own internal binding.
- **Production params stay tested.** `crypto.test.ts` opts out (`vi.unmock("./kdf")`):
  it asserts `newKdfParams()` equals ADR-0002 and runs the Argon2id known-answer vectors.
  `wire.test.ts` still checks that the defaults sit inside the bounds. If the opt-out
  broke, the ADR-0002 assertion would fail.
- **No production code changes.** No environment switch and no test hook in `src/crypto`.
- **IV-uniqueness test: 2,000 seals, not 10,000.** It exists to catch a constant,
  counter-reset or low-entropy IV, and 2k catches those as well as 10k.

## Consequences

- Measured locally: the full suite went from 35–38 s to 26–33 s, the passphrase-change
  test from 4.4 s to under 0.7 s, with no timeouts in three runs.
- A test that needs the real params must live in `crypto.test.ts` or `vi.unmock` too.
- Import time (PGlite WASM, starting Chrome) is now ~half the run; that's the next lever.
