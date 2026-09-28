# ADR-0036 — E2E-only record probe, excluded by module aliasing

**Status:** Accepted · 2026-09-28 · issue #79 (closes #46; `area:security`, owner approval) · builds on [ADR-0035](0035-e2e-harness.md)

## Context

M1's acceptance needs "B decrypts a record A created". M1 has no record write path (push
arrives with M2) and no record UI, and the household key lives only in the browser's key
session. The owner chose (2026-09-28) a probe compiled in only for E2E builds, over
deferring the check to M2.

## Decision

- **`src/features/e2e/record-probe.tsx`**: "Seal" encrypts a text under the session's
  household key exactly as records will be (`seal`, AAD `recordAad(id, 1)`, the HDK's kid)
  and shows the envelope. "Open records" pulls through the real `GET …/records` and
  decrypts. It never sends plaintext and never touches keys outside `keySession`.
- **The spec inserts the envelope into `records` with SQL**, standing in for M2's push. The
  server-side read path, guard and envelope format are all the real ones.
- **Excluded by module resolution, not by a runtime check.** The page imports the fixed name
  `nwt-e2e-probe`. `next.config.ts` aliases it (`turbopack.resolveAlias`) to the probe only
  when `NEXT_PUBLIC_E2E=1`, and otherwise to `probe-stub.tsx`, which renders nothing.
  tsconfig maps the name to the stub for type-checking. We tried a constant-false
  `dynamic(import())` first: Turbopack still emitted the probe's chunks (client and SSR)
  in a normal build.
- **Enforced in CI:** after the E2E run, `e2e.yml` builds without the flag and fails if the
  marker `nwt-e2e-record-probe` appears anywhere in `.next`.
- **Leak scans cover what can be named.** Passphrases, recovery phrases (whole and every
  3-word run), and the record plaintext are checked in every request body and URL, in
  local/session storage, and in every `public` table (as text and hex). IndexedDB must
  hold no databases. Private keys and the HDK are non-extractable, so they have no raw
  form to search for; the unit suites keep asserting they never leave.
- **Sign-in rate limits stay as they are.** All browsers in a run share one IP, and code sends
  are limited to 3 per 5 min per IP, so `signIn` empties the throwaway `rate_limit` table
  first. No test switch exists in the auth config.

## Consequences

- The probe goes away (or becomes a real record screen's test) once M2 has push.
- `E2E_ENV` sets `NEXT_PUBLIC_E2E=1` for the webServer build only. A local `pnpm e2e` that
  reuses a normal server on :3100 fails at the probe step, which is loud, not silent.
- Passkey fast unlock stays a manual owner check on a real device (#75); headless has no
  authenticator.
