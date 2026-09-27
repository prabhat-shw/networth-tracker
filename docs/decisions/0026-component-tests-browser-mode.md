# ADR-0026 — Component tests in Vitest browser mode; sign-in client choices

**Status:** Accepted · 2026-09-27 · issue #45 · owner chose browser mode over happy-dom

## Context

#45 is the first UI with security-relevant behaviour: what a sign-in screen sends and
stores. Asserting that needs real `fetch`, `localStorage` and IndexedDB, not simulated ones.
The Playwright CDN download of Chromium timed out on the owner's machine.

## Decision

- **Vitest browser mode** with `@vitest/browser-playwright` and `vitest-browser-react`
  (Apache-2.0 / MIT, dev only). Two Vitest projects: `unit` (Node, `*.test.ts`) and
  `browser` (`*.browser.test.tsx`). `pnpm test` runs both, so both gate every PR.
- **Installed Chrome, not a downloaded Chromium** (`channel: "chrome"`). GitHub's Ubuntu
  runners ship Google Chrome, and developers have it, so nothing is downloaded. The #46
  E2E suite can reuse the same choice.
- **Assertions:** `toHaveTextContent` is exact in Vitest 5; partial text uses
  `toMatchTextContent`. Tests reset between cases with `cleanup()`, never a manual
  `unmount()` (a double unmount breaks the next test's render).
- **Auth client** (`src/features/auth/auth-client.ts`) looks `fetch` up per call
  (`customFetchImpl`), so the requests tests intercept are the ones that go out. It maps
  Better Auth errors to four UI outcomes: wrong code, stale code (expired or too many
  tries), rate-limited (with `X-Retry-After`), failed.
- **Passkey hint:** `localStorage["nwt.passkey"] = "1"` once this browser registers a
  passkey (#53). It only decides whether the passkey button is shown, is not a secret, and
  is read inside `try`. Nothing else from sign-in is stored; a test asserts it.

## Consequences

- Running tests needs Google Chrome installed. A machine without it can set up Chromium
  with `pnpm exec playwright install chromium` and drop `channel`.
- The Chrome version drifts with the runner image; a breaking Chrome change could fail CI
  unrelated to our code.
