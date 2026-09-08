# 4. How the app works (for developers, from zero)

No prior knowledge of the stack assumed. If a term is new, check the [glossary](GLOSSARY.md).

## The one-paragraph version

The app is a website that behaves like an installed app (a **PWA**). Almost everything happens
in your browser: data is decrypted, calculated and drawn there. A small server exists only to
hold encrypted blobs so your phone and laptop can sync, and to cache public price lists. The
server can never read your data — which means every feature has to be designed to work on the
client.

## The pieces

```
+------------- Browser (the only place readable data exists) -------------+
|  src/crypto/    locks and unlocks data                                  |
|  src/domain/    the maths: net worth, ownership shares, goals, XIRR      |
|  src/parsers/   reads statement files (PDF/CSV) - never uploaded         |
|  src/db/        Dexie -> IndexedDB: local store of encrypted records     |
|  src/features/  the screens                                             |
+---------------+---------------------------------------------------------+
                | encrypted blobs in, encrypted blobs out
+---------------v----------------------+----------------------------------+
|  Sync API (Next.js route handlers)   |  Price cache                     |
|  Postgres via Drizzle - ciphertext   |  AMFI NAVs, shares, FX rates     |
+--------------------------------------+----------------------------------+
```

**Next.js** is the framework hosting both the pages and the small API. Note something unusual:
Next.js normally renders pages on the server, but our server holds only encrypted bytes, so it
*cannot* render your data. We use it as an app shell plus an API host — the reasoning is in
[ADR-0007](../decisions/0007-nextjs-as-app-shell.md).

**Dexie** is a friendly wrapper over **IndexedDB**, the browser's built-in database. It is how
the app works offline.

**Drizzle** is how the server talks to **Postgres** in typed TypeScript.

## Following one action end to end

Say you add a fixed deposit of ₹5,00,000 held jointly with your spouse:

1. **The screen** (`src/features/...`) collects the details and hands over a plain object.
2. **The domain layer** (`src/domain/...`) validates it. Amounts are stored as **integer
   paise** (₹5,00,000 becomes `50000000`) because floating-point maths silently loses money.
3. **The crypto layer** (`src/crypto/...`) serialises the record and encrypts it with the
   household key. Out comes a blob of bytes.
4. **The local database** (`src/db/...`) saves the blob and queues it for sync.
5. **The sync engine** pushes the blob to the server, which stores it with a version number.
   Your laptop pulls it later and decrypts it with the same household key.
6. **Valuation** happens whenever a screen needs a number: the domain layer takes the
   decrypted records, applies today's downloaded prices, applies each owner's share, and
   returns totals for the lens you are viewing.

Steps 2 and 6 are pure functions — no network, no database, no React. That is deliberate: they
hold all the logic that could be wrong about money, so they are the easiest part to test
exhaustively, and their unit tests are the gate every pull request must pass.

## Why the layers are separated this way

- **`domain/` knows no framework.** You can read and test the money maths without knowing
  React. If the UI were rewritten tomorrow, this survives untouched.
- **`crypto/` knows nothing about finance.** It seals and opens bytes. That keeps the
  security-critical code small enough to review properly.
- **The server is deliberately stupid.** It stores versioned blobs and caches public prices.
  Because it does so little, it can later be rewritten in Rust without the client noticing —
  a planned milestone, made safe by the contract in [`docs/api/CONTRACT.md`](../api/CONTRACT.md).

## Where things live

| Path | What it is |
| --- | --- |
| `src/app/` | Routes and API handlers (Next.js App Router) |
| `src/domain/` | Money maths — pure, framework-free, heavily tested |
| `src/crypto/` | Encryption and key handling |
| `src/db/` | Local (browser) storage |
| `src/features/` | Screens and components, grouped by feature |
| `src/lib/` | Small shared utilities, e.g. build version |
| `docs/` | Everything explaining the above |

## Rules that are not negotiable

Repeated here because they shape every design decision:

1. The server never receives readable data.
2. Keys never leave the device.
3. Price requests must not reveal what you hold.
4. Statements are parsed on the device.
5. Money is integer paise — never a floating-point number.
6. `domain/`, `crypto/` and `parsers/` import no UI framework.

The full list with rationale is in [`CLAUDE.md`](../../CLAUDE.md) and
[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).
