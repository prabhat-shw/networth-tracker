# Changelog

All notable changes are recorded here. Format follows [Keep a Changelog]; the project uses
semantic versioning (see ADR-0009). Entries are written from Conventional Commit subjects.

## [Unreleased]

### Security
- Patched sign-in library (#147): better-auth 1.7.12 closes a critical advisory where OAuth
  state could be replayed as a magic link, and a high-severity OAuth proxy sign-in flaw.
- Patched dependencies (#142): Next.js 16.4.2 closes two critical remote-code-execution
  advisories and a denial of service; zod and vite move past high-severity advisories.
- Encrypted sync is live (M2, #118): records written on one device now reach every other
  member's device, including edits made offline. When two people change the same record,
  both devices settle on the latest edit. The server still only ever sees padded ciphertext.
- Encrypted record push (M2, #114): devices can now upload sealed records. Each one applies
  only over the version it was based on, so an offline edit never silently overwrites a newer
  one. The server checks size and padding only, and still can't read a byte.
- The server refuses a sign-in-methods update that would leave no way back in (M1, #108),
  so a faulty app version can't strand your data on one device.
- Identity vault v3 (M1, #88): groundwork for "email and done" sign-in. The key can live on
  this device under a key no script can read, and a recovery method can be added later
  without re-entering anything; the server still sees only which methods exist.
- Dependencies (#86): Next.js 16.3.4 → 16.3.8 (critical `next/og` RCE advisory
  GHSA-vcvr-r3jv-pc5j); `sharp` ≥ 0.35.5 and `source-map-js` ≥ 1.2.2 via pnpm overrides.

### Changed
- The first person on a new server just signs in with their email: no invite command on the
  host (#120). After that first sign-up, the server is invite-only as before.
- Home after sign-in (M1, #105): opens on an empty "Your household net worth will show up
  here" screen. Inviting someone is now an optional **Invite a member** action, not the
  first thing you see.
- First run asks nothing (M1, #97): after the email code or link, the app sets itself up
  on this device and opens; coming back on the same device opens it without unlocking. A
  way back in is chosen at the first invite. iPhone users get an "Add to Home Screen" hint.

### Added
- Every kind can now be added, edited and deleted (#136): each type gets its own fields
  (maturity and rate for an FD, units and scheme code for a mutual fund, EMI for a loan),
  "Save & add another" keeps you in the same category, and you can tag a record to a goal.
- Add anything (#135): add an account, deposit, property, policy or loan from Home in three
  steps (category, type, details), with search. "Owned by" defaults to just you; split a
  joint record between members, and Save waits until the shares add up to 100%. A few types
  that need more details (mutual funds, RDs, money lent) arrive in the next update.
- Your name (M3, #132): Home asks what your household should call you. The name is stored
  encrypted, so only your household sees it, and you can change it at any time.
- Settings → Security (M1, #103): see your ways back in, add or remove them (one always
  stays), switch app lock on or off, and Lock now. Turning app lock off asks for your
  passkey or passphrase first. The protection banner's **Fix** opens it.
- Protection banner (M1, #101): a strip above the app names each risk to your data, such
  as no way back in, only one way back in, or app lock off, until you fix it. Passkeys
  that sync (iCloud Keychain, Google Password Manager) count as a second way back in.
- Protect before sharing (M1, #90): inviting someone needs a way back in first, either Face
  ID / passkey, a passphrase or a recovery kit; the server refuses otherwise. Choosing Face ID
  also turns on app lock.
- Magic-link sign-in (M1, #96): "Email me a link instead" beside the email code. The link
  works once, for 15 minutes, and signs in only when you tap Continue.
- Passkey fast unlock (M1, #74, #75): unlock with Face ID, a fingerprint or a passkey on
  browsers that support it; the passphrase opens in place as the fallback, and by itself after
  two failed tries. Set up at first run or from a one-time offer after a passphrase unlock.
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
- Dark mode (#84): the page now follows the system theme, so inputs and buttons no longer
  turn black or invisible on a white page.
- Sign-in (#82): switching to the mail app for the code and coming back no longer empties the
  email field and hides the code field.
- Vercel builds: skip standalone output there (Next 16.3 `next-server.js.nft.json` ENOENT).
- Docker image builds from a Windows checkout: added `.dockerignore` and `public/`.

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
