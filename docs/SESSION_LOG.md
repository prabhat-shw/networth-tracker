# Session log

One line per session: date · issue · outcome.

- 2026-09-08 · M0 foundation · scaffold, docs, ADRs 0001-0007, CI, Compose, repo + issues #1-#7 · green
- 2026-09-08 · PR #8 · ADR-0008 branching policy, pre-push hook blocking main
- 2026-09-08 · PRs #8-#11 · branching policy, build identity, UX spec + prototype, knowledge base + doc freshness gates
- 2026-09-25 · issue #1 · Drizzle + Postgres, ciphertext-only records table, migrate service, /api/health, .dockerignore fix, ADR-0011 · green, compose verified
- 2026-09-25 · issue #2 · DEMO_MODE build guard, demo banner, DEPLOYMENT.md; Vercel/Neon linking left to owner · green
- 2026-09-25 · fix · Vercel ENOENT (standalone off on Vercel), detailed staging steps in DEPLOYMENT.md
- 2026-09-26 · issue #2 · staging live on Vercel + Neon, DEPLOYMENT.md corrected from the real setup · M0 complete
- 2026-09-26 · handoff · M0 closed (PRs #18-#22), staging at networth-staging.vercel.app, ADR-0012 · next: #3
- 2026-09-26 · issue #3 · crypto primitives (Argon2id, AES-GCM envelope, ECDH/HKDF/AES-KW) + KAT vectors, ADR-0013 · PR awaits owner approval
- 2026-09-26 · PR #17 · merged main, inflation default 8% (ADR-0014), UX §12.1 marked owner-reviewed
- 2026-09-26 · PR #17 · UX principle 8: fewest actions, tap budgets per task (ADR-0017)
- 2026-09-26 · PR #17 · prototype brought within all 7 tap budgets (principle 8), mobile scroll fix
- 2026-09-26 · issue #14 · six borrowed features filed as #25-#32 (ADR-0016), AGPL-3.0-only licence (ADR-0015)
- 2026-09-26 · issue #4 · identity vault: passphrase + 24-word recovery wraps, passphrase change, restore, rotation (ADR-0018)
- 2026-09-26 · issue #5 · household HDK: static-static ECDH wraps, key fingerprints, households/members tables + records FK (ADR-0019)
- 2026-09-26 · issue #6 · split into #6/#37/#38; auth core: Better Auth, passkeys + SMTP OTP, invite-only, rate limits (ADR-0020)
- 2026-09-26 · issue #40 · fix: auth table ids default to gen_random_uuid(); PGlite migration-backed auth test
- 2026-09-27 · issue #37 · membership guard (401/404, no existence oracle), guarded records read route, member_id→user FK, node 24.x (ADR-0021)
- 2026-09-27 · issue #38 · split (#43 member relay); vault wire codec with KDF bounds, identity_vaults table, GET/PUT /api/identity/vault, immutable public key (ADR-0022)
- 2026-09-27 · issue #43 · household member relay: POST /api/households, household-bound invites (0006), member rows keyed to vault public keys, invitee decrypts creator's record (ADR-0023)
- 2026-09-27 · issue #7 · key session (closure-held keys, 5-min auto-lock, pagehide lock), unlock screen; UX §3.1 owner decisions; passkey PRF split to #48 (ADR-0024)
- 2026-09-27 · issue #50 · UX.md §3.0 draft: sign-in, first run, joining with two-way code check, tap budgets, API gaps for #45 (ADR-0025, proposed)
- 2026-09-27 · issue #45 · split (#53 first run, #54 restore); sign-in screen (auto-submitting code, 429 countdown, passkey hint), routing gate, Vitest browser mode on installed Chrome (ADR-0026)
- 2026-09-27 · issue #56 · GET /api/households: own memberships + invited flag (split from #53)
- 2026-09-27 · issue #53 · first run: passphrase, recovery kit (hand-written PDF, 2-word confirm), vault upload after confirm, silent household or wait-to-join, passkey offer; test projects sequenced; #58 filed (ADR-0027)
- 2026-09-27 · issue #54 · restore with recovery kit in place on the unlock screen: word-level typo messages, other-account kit, upload retry, gate adopts the new vault
- 2026-09-27 · issue #58 · tests use the Argon2id bounds floor except crypto.test (production params + KATs); IV test 2k seals; suite 35-38 s -> 26-33 s, no timeouts (ADR-0028). Also #61: vitest config as .mts
- 2026-09-27 · issue #52 · split (#63 invitee, #64 inviter); GET /api/households lists invites with inviter name; cancel and decline endpoints, hashes in bodies only (ADR-0029)
- 2026-09-27 · issue #63 · household gate: household key unwrapped after every unlock, waiting-to-join and confirm-the-sender screens, per-device trusted senders (ADR-0030)
- 2026-09-28 · issue #64 · minimal Household panel: members, invite, pending/ready rows, inviter code check (match wraps to the shown key and adds; mismatch cancels, wraps nothing) (ADR-0031)
- 2026-09-28 · issue #69 · CI requires CHANGELOG.md with src/ changes (no-changelog label opts out); /handoff docs-impact pass; PR bodies from the template (ADR-0032)
- 2026-09-28 · issue #71 · first-run upload-failure test asserts recovery-word cell 1 by position, not by unique text (no more strict-mode flake on repeated words)
