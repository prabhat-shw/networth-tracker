# ADR-0039 — Magic-link sign-in, with the token in the fragment

**Status:** Accepted · 2026-10-11 · issue #96 (split from #89) · implements part of [ADR-0037](0037-onboarding-v2-key-on-device.md) · extends [ADR-0020](0020-auth-invite-only-otp-passkeys.md)

## Context

ADR-0037 wants "email code (or magic link) and done". Better Auth's `magicLink` plugin mails
a link to its own `GET /api/auth/magic-link/verify?token=…` route, which spends the token on
the first GET. Two problems: mail security scanners (Outlook Safe Links and similar) open
links before the user does, which would burn the token; and the token sits in the request
line, so it lands in proxy and access logs and in the Referer of whatever loads next.

## Decision

- **Plugin:** `magicLink({ expiresIn: 900, storeToken: "hashed" })` beside the email OTP. Tokens
  are single-use (the plugin consumes them atomically). 15 min, not the OTP's 5: opening mail,
  maybe on another app, takes longer than reading a code.
- **Same gate as the code:** a link is mailed only to an existing account or an invited
  address; the answer is always `200 { status: true }`. Account creation still goes through
  the `user.create.before` invite check, so a link for a revoked invite gets `403`.
- **Our own link:** `sendMagicLink` ignores the plugin's URL and mails
  `APP_ORIGIN/#link=<token>`. The fragment never leaves the browser, so loading the link sends
  nothing. The sign-in screen moves the token into memory, clears it from the address bar
  (`history.replaceState`), and shows **Continue**; only that tap calls
  `GET /magic-link/verify?token=` (no `callbackURL`, so a good token answers JSON + cookie).
  A scanner that only fetches the page spends nothing.
- **Success means a session in JSON.** A bad token makes the plugin redirect, and `fetch` follows
  that to HTML, so the client counts only a JSON body with `session` as signed in;
  anything else is `stale-link`.
- **Rate limits:** `/sign-in/magic-link` 3 / 5 min (it sends mail, like the OTP send);
  `/magic-link/verify` 5 / 5 min.
- **UI:** a text button "Email me a link instead" under Send code (UX.md §3.0 A). The code
  stays the primary path: it works when the mail is read on another device.

## Consequences

- One more way in for whoever controls the mailbox. That's the same exposure as the code, and
  auth only gates ciphertext; it never yields a data key.
- A link opened on another device (or in a mail app's in-app browser) signs in *there*. The
  copy says "Open it on this device"; the code covers the cross-device case.

## Alternatives rejected

- **The plugin's default link** (`/api/auth/magic-link/verify?token=…&callbackURL=/`):
  burned by link scanners, and the token ends up in logs.
- **Code and link in one email:** needs a token minted outside the plugin's endpoint, which
  means reimplementing its storage format. Two buttons are simpler and the cost is one tap.
