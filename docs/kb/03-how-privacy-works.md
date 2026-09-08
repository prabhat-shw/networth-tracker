# 3. How your privacy works

The honest summary: **the app's server cannot read your financial data.** Not "promises not
to" — *cannot*. This page explains how, without assuming you know any cryptography.

## The locked box

Imagine writing each of your accounts on a card, locking every card in its own steel box, and
storing the boxes in a warehouse. The warehouse owner can count your boxes and weigh them.
They cannot open one. You hold the only key, and you never gave them a copy.

That is exactly the arrangement here:

| The analogy | The real thing |
| --- | --- |
| Writing and reading cards | Your phone or laptop |
| The lock | AES-256-GCM encryption, performed in your browser |
| The warehouse | The server (your home machine, or a hosting provider) |
| The key | Derived from your passphrase, never leaves your device |

For each item, the server stores a random ID, a version number, a timestamp, and a blob of
scrambled bytes. It does not even store the *type* of item. Someone who stole the entire
database would learn roughly how many things you own, and nothing else.

## Then how does it know share prices?

Because prices are **public**. A mutual fund's NAV is the same for you as for everyone else.
The server downloads the whole daily price list — every mutual fund in India, a list of
shares, exchange rates — and your device downloads that same complete list and matches
locally.

This detail matters more than it looks. If your device asked the server "what is the NAV of
*this* fund?", the question itself would reveal what you own. Downloading everything asks no
question at all.

Your device does the arithmetic. The server never sees a holding, a quantity, or a total.

## Sharing with your spouse

You each have your own key. The household has a shared key that unlocks the data.

When you invite your spouse, your device takes the household key and locks it *inside a box
that only their key can open*, then hands that box to the server to pass along. The server
carries the box; it cannot open it.

Remove someone later and they stop receiving new data. Anything they already downloaded, they
already have — the same as with any shared file. Worth knowing rather than pretending
otherwise.

## Unlocking, and what "no password reset" means

When you open the app you enter your passphrase. It is put through **Argon2id**, a
deliberately slow calculation, to produce your key. The slowness is the point: it makes
guessing passphrases in bulk impractical. Your device may also offer fingerprint or face
unlock through a **passkey**, which is a convenience layer over the same key.

Because the key never reaches the server, **nobody can reset your password and hand your data
back.** That is the flip side of the guarantee. So there are two independent ways back in:

1. **Your recovery kit** — 24 words generated at setup. Print it; keep it with your important
   papers. It can rebuild your key.
2. **Your spouse** — if they still have access, they can re-share the household key with your
   new account.

Lose the passphrase, the recovery kit, *and* your spouse's copy, and the data is gone. That is
a real trade-off, taken deliberately, and the app says so plainly instead of burying it.

## What the app never touches

No bank login. No SMS. No email. No contacts. No location. No analytics, no tracking, and no
third-party code loaded from the internet — the page is locked down so that even a compromised
dependency cannot phone home.

## Where to read more

The engineering detail lives in [`docs/SECURITY.md`](../SECURITY.md) — the threat model, i.e.
who we defend against and how — and in the decisions
[ADR-0001](../decisions/0001-zero-knowledge-architecture.md) and
[ADR-0002](../decisions/0002-key-hierarchy-and-sharing.md).
