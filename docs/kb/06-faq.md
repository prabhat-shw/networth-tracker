# 6. FAQ & troubleshooting

## Using the app

**Do I have to give it my bank login?**
No, and there is no way to. The app has no bank connection, reads no SMS and no email. You
enter what you own; it fetches only public prices to value it.

**How often do values update?**
Once a day, when price lists refresh. Mutual fund NAVs are published daily, so a "live"
portfolio number would be fiction. Every figure can tell you the date it is *as of*.

**Why does my net worth differ between "Me" and "Household"?**
Because they are different questions. "Me" counts your share — half of a joint account, your
60% of the flat, none of your spouse's PPF. "Household" counts everything at full value. Both
are correct; the lens control says which one you are looking at.

**What is "Unallocated"?**
Money you have not earmarked to any goal. It is shown deliberately rather than hidden, so you
can decide what it is for.

**My emergency fund says 89% funded but it is flagged off track. Why?**
Because a goal is judged on *suitability*, not just the total. If part of the money is locked
in a deposit that matures after you need it, it cannot do the job — a sum alone would hide
that.

**Can my spouse see everything?**
They see what is shared with the household. Ownership shares determine how numbers are split,
not who can look.

**I forgot my passphrase. Can you reset it?**
Nobody can — that is the point of the design. Use your 24-word recovery kit, or ask your
spouse to re-share the household key with a new account. If both are gone, so is the data.
See [How your privacy works](03-how-privacy-works.md).

**Does it work without internet?**
Yes. Everything is stored on your device; changes sync when you are back online. Prices will
be stale, and the app will say so rather than pretend.

**Is my data on someone else's computer?**
Only as encrypted bytes, and only so your devices can sync. Production runs on the owner's own
machine, reachable over a private network.

## For developers

**`pnpm dev` fails on Node version**
The project needs Node 24+ (`.nvmrc`). Run `nvm use`, or install a current Node.

**`pnpm` is not found**
`corepack enable` once. The pnpm version is pinned in `package.json`.

**`pnpm check` passes locally but fails in CI**
Check the *exit code*, not the output text. Biome's coloured output can split an error
message so a text search misses it: `pnpm check; echo $?`.

**Typecheck complains about `LayoutProps`**
Next 16 generates some types during a build. `src/app/layout.tsx` deliberately declares its
props explicitly so `tsc --noEmit` passes on a clean checkout.

**Push to `main` is rejected**
Working as designed ([ADR-0008](../decisions/0008-branching-and-review.md)). Branch, then open
a PR. If the hook is *not* stopping you, run `git config core.hooksPath .githooks`.

**`pnpm check:docs` fails on a broken link**
A relative link points at a file that does not exist. Fix the link or add the file — this is
the check that stops documentation rotting silently.

**The README status block is stale in CI**
Run `pnpm docs:sync` and commit. It is generated from `package.json` and `docs/STATE.md`.

**Docker build cannot find the git SHA**
`.git` is not in the build context on purpose. Pass it:
`GIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build`.

**Is the deploy live?**
Compare the build badge in the UI, or `curl /api/version`, against
`git rev-parse --short HEAD`. If they differ, you are looking at an old cached build — the
in-app banner will offer a reload.
