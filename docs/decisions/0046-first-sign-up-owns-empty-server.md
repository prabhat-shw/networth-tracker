# ADR-0046 — The first sign-up on an empty server becomes its owner

**Status:** Accepted · 2026-10-11 · owner decision · issue #120 · amends [ADR-0020](0020-auth-invite-only-otp-passkeys.md) (invite-only)

## Context

Under ADR-0020 the first person on a fresh server had to run `pnpm auth:invite <email>` on
the host before they could sign in. The owner found this unfriendly: "running a command"
is not onboarding. Everyone after the first person is already invited from the app, so the
CLI step existed only to bootstrap the first account.

## Decision

- **A server with no users accepts one uninvited sign-up, once.** While the `user` table is
  empty, a code or link is mailed to any address. The first address to complete sign-in
  becomes the owner, and its account and household are created as usual (ADR-0041).
- **The claim is atomic and permanent.** The `user.create.before` hook writes the address's
  SHA-256 into `server_owner`, a single-row table whose primary key is fixed at `1`. Of
  racing first sign-ups exactly one insert wins, and the others get the usual 403. The row is
  never deleted, so a database opens to an uninvited address at most once, even if every
  account is later removed. Only the hash is stored, as for invites.
- **A server that already has users never opens**, whether or not it has a claim row. This
  covers servers that existed before this change (staging, an existing home server).
- **After the claim, nothing changes:** mail goes only to existing accounts and invited
  addresses, every other address gets the same response, and the hook refuses uninvited
  accounts. Spouses and family are invited in-app (ADR-0023).
- **`pnpm auth:invite` stays** as the admin's tool for re-invites, recovery and the E2E
  harness. No user needs it.
- **No on/off switch.** The window exists only on an empty database, so a switch would
  protect nothing a deploy step can't.

## Consequences

- **Claim race:** whoever reaches a freshly deployed, empty server first owns it. On the
  Tailscale-only home server, only your own tailnet can get there first. On anything
  reachable from the internet (staging, or a future public origin for #93), sign in right
  after the first deploy; `/api/health` does not reveal whether the server is claimed.
- Until the claim, the server will mail a code to any address it is asked to, which is
  bounded by the existing per-IP send limit (3 per 5 min).
- A failed claim attempt (the account create fails after the claim) can be retried by the
  same address only. Anyone else then needs `pnpm auth:invite`.
- New table `server_owner` (migration `0007`): staging needs `pnpm db:migrate` before merge.

## Alternatives rejected

- **Open sign-up, a household per user:** it needs captcha, quotas and an abuse policy, and
  it is pointless for a single-household server.
- **A setup token printed in the server log:** still a host-side step, which is the friction
  being removed.
- **"Users table empty" alone, without the claim row:** two concurrent first sign-ups would
  both pass the check, and a wiped server would silently reopen.
