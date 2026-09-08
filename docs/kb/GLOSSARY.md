# Glossary

Finance and engineering terms in one place. Fuller explanations:
[money concepts](02-money-concepts.md) and [how the app works](04-how-the-app-works.md).

## Money

| Term | Meaning |
| --- | --- |
| **AMFI** | Industry body publishing every Indian mutual fund's NAV daily — the app's free price source |
| **Asset / Liability** | What you own / what you owe |
| **CAGR** | Smoothed annual growth rate of a lump sum |
| **CAS** | Consolidated Account Statement — one PDF listing holdings across fund houses and demat accounts |
| **CAMS / KFin** | Registrars that administer mutual fund folios |
| **Demat** | The electronic account that holds your shares |
| **Earmarking** | Tagging money to a goal; untagged money shows as *Unallocated* |
| **EPF / VPF** | Employees' / Voluntary Provident Fund — salary-linked retirement savings |
| **ESPP** | Employee Share Purchase Plan — buying employer shares at a discount |
| **FD / RD** | Fixed / Recurring Deposit |
| **FI** | Financial Independence — investments could cover expenses indefinitely |
| **Folio** | Your account number with a fund house |
| **Inflated target** | What a goal will cost by its target date, after inflation |
| **Liquidity** | How fast an asset becomes spendable money |
| **NAV** | Net Asset Value — price of one mutual fund unit, published daily |
| **NPS** | National Pension System — market-linked retirement account |
| **NSDL / CDSL** | The two depositories holding Indian shares electronically |
| **NSE / BSE** | India's two main stock exchanges |
| **Ownership share** | The percentage of an item belonging to a person |
| **Paise** | 1/100 of a rupee. All money is stored as whole paise |
| **PPF** | Public Provident Fund — 15-year tax-free government savings scheme |
| **Required SIP** | Monthly investment needed to close a goal's gap |
| **RSU** | Restricted Stock Unit — employer shares that vest over time |
| **SGB** | Sovereign Gold Bond — government bond priced to gold |
| **SIP** | Systematic Investment Plan — fixed monthly investing |
| **SSY** | Sukanya Samriddhi Yojana — savings scheme for a girl child |
| **XIRR** | Return rate accounting for irregular cash flows; the honest measure for SIPs |

## Engineering

| Term | Meaning |
| --- | --- |
| **ADR** | Architecture Decision Record — a short note capturing a decision and its reasoning |
| **AES-256-GCM** | The encryption used for every record; also detects tampering |
| **Argon2id** | Deliberately slow function turning a passphrase into a key, to resist guessing |
| **Biome** | The linter and formatter; `pnpm check` runs it |
| **Ciphertext** | Encrypted bytes. All the server ever stores |
| **Contract test** | A test run against the API itself, so an implementation can be swapped safely |
| **Dexie** | Friendly wrapper over IndexedDB |
| **Drizzle** | Typed TypeScript layer for talking to Postgres |
| **E2EE** | End-to-end encryption — only the endpoints can read the data |
| **ECDH** | Key agreement, used to wrap the household key for another member |
| **HDK** | Household Data Key — the shared key that unlocks the household's records |
| **IndexedDB** | The browser's built-in database; how the app works offline |
| **Next.js** | The framework hosting the app shell and the small API |
| **Passkey** | Fingerprint/face login replacing a password, tied to the device |
| **Playwright** | Runs the app in a real browser for end-to-end tests |
| **Postgres** | The server's database, storing ciphertext only |
| **PWA** | Progressive Web App — a website installable to a home screen, works offline |
| **Ruleset / branch protection** | GitHub rules stopping direct pushes to `main` |
| **SHA** | The short commit id stamped into each build, so you know which build you are running |
| **Tailscale** | Private network making the home server reachable without exposing it publicly |
| **Tombstone** | A "this was deleted" marker, so deletions propagate between devices |
| **Vitest** | The unit test runner; its suite is the pull-request gate |
| **WebCrypto** | The browser's built-in cryptography, used instead of shipping our own |
| **Zero-knowledge** | The server holds your data but cannot read it |
