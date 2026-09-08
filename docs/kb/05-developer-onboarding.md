# 5. Developer onboarding

From a fresh clone to your first merged change. Assumes you can use a terminal and git;
assumes nothing about this stack.

## 1. Prerequisites

| Tool | Why | Check |
| --- | --- | --- |
| Node.js 24+ | Runs the app and the tests | `node -v` |
| pnpm | Package manager (via Corepack: `corepack enable`) | `pnpm -v` |
| Docker | Postgres, and the production-shaped deploy | `docker --version` |
| gh (GitHub CLI) | Issues and pull requests from the terminal | `gh --version` |

## 2. Set up

```bash
git clone git@github.com:prabhat-shw/networth-tracker.git
cd networth-tracker
pnpm install
git config core.hooksPath .githooks   # blocks accidental pushes to main
cp .env.example .env                  # set POSTGRES_PASSWORD and BETTER_AUTH_SECRET
pnpm dev                              # http://localhost:3000
```

Generate a secret with `openssl rand -base64 32`. Never commit `.env`.

## 3. The commands you will actually use

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the app locally with hot reload |
| `pnpm test` | Unit tests — the gate for every PR |
| `pnpm test:watch` | Tests re-running as you type |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm check` | Biome lint + format check (CI runs this exact command) |
| `pnpm format` | Fix formatting and safe lint issues |
| `pnpm check:docs` | Doc size caps, link integrity, ADR hygiene |
| `pnpm docs:sync` | Regenerate the README status block |
| `docker compose up -d --build` | The production-shaped stack: app + Postgres + Caddy |

**Always check the exit code, not the printed output.** Coloured output has hidden a real
failure from a text search here before; `echo $?` does not lie.

## 4. How work is organised

The project is built in short, self-contained sessions. The rules live in
[`docs/CONTEXT.md`](../CONTEXT.md), and they matter as much as the code:

1. **One issue = one branch = one pull request.** Never commit to `main`
   ([ADR-0008](../decisions/0008-branching-and-review.md)); a pre-push hook enforces it.
2. **Start by reading three files only:** [`CLAUDE.md`](../../CLAUDE.md),
   [`docs/STATE.md`](../STATE.md), and the current milestone brief in `docs/phases/`. Then
   `gh issue view <N>`. That is the whole warm-up.
3. **Finish by rewriting `docs/STATE.md`** so the next session starts informed, and append a
   line to `docs/SESSION_LOG.md`.
4. **Record decisions as ADRs** in `docs/decisions/` — 60 lines, in the same PR as the change.

## 5. Your first change, start to finish

```bash
gh issue list -s open                    # pick a size:S issue
git switch -c feat/short-description
# ... edit, with tests ...
pnpm test && pnpm typecheck && pnpm check && pnpm check:docs
git commit -m "feat: describe the change"   # Conventional Commits, no AI attribution
git push -u origin feat/short-description
gh pr create                             # fill in the checklist; use "Closes #N"
```

CI must be green before merge. Anything touching `area:crypto` or `area:security` also needs
the owner's explicit approval — never self-merge those.

## 6. Where to be careful

- **Money is integer paise.** Use `src/domain/money.ts`. A stray `0.1 + 0.2` in a net-worth
  total is a real bug, not a rounding curiosity.
- **Nothing readable may reach the server.** If a change puts household data in a request
  body, a log line, or a URL, it is wrong regardless of how convenient it is.
- **Keep `domain/`, `crypto/` and `parsers/` framework-free.** No React imports. They are pure
  so they can be tested exhaustively.
- **Files stay under ~300 lines** and a change should touch at most ~6 files. If it needs
  more, the issue was too big — split it.
- **Do not add a dependency casually.** Every one is code that runs inside the vault. Prefer
  the platform (WebCrypto, Intl) over a package.

## 7. Testing tiers

1. **Unit (Vitest)** — pure logic: crypto, valuation, goals, parsers. Required; this is the
   PR gate.
2. **Component (browser mode)** — a single component's real-DOM behaviour.
3. **End-to-end (Playwright)** — assembled flows, plus two security specs that must never be
   deleted: *one household cannot read another's records*, and *the database contains no
   plaintext*.
4. **Contract tests** — run against the API; they are what will make the future Rust backend
   a swap rather than a rewrite.

## 8. Reading list, in order

1. [What is this app?](01-what-is-this.md) — the product
2. [How the app works](04-how-the-app-works.md) — the architecture
3. [How your privacy works](03-how-privacy-works.md) — the constraint that shapes everything
4. [`docs/PLAN.md`](../PLAN.md) — the full plan and roadmap
5. [`docs/decisions/`](../decisions/) — why things are the way they are
