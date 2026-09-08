# ADR-0007 — Next.js as an app shell, not an SSR engine

**Status:** Accepted · 2026-09-08

## Context

The owner chose Next.js 16 + React 19 for v1 (with a Rust backend planned for v2, ADR-0008
when it lands). But under zero-knowledge, the server holds only ciphertext, so React Server
Components cannot render any user data.

## Decision

Use Next.js as (a) a client-rendered, offline-capable PWA shell and (b) the host for the
thin API routes (auth, sync, price cache). Accept that RSC/SSR add little for user data;
they are still used for static marketing/help pages and route-level code splitting.

Alternatives rejected: Vite SPA + separate API (two deploy units, and the owner already
built one that way); SvelteKit (owner chose to stay on React for v1 and learn a new stack
on the backend instead).

## Consequences

- Data-fetching lives in client components over Dexie, not in server components.
- The API surface stays small and framework-agnostic, which is exactly what makes the M9
  Rust/Axum reimplementation a contract swap rather than a rewrite.
- Bundle size needs watching (crypto + PDF parsing are lazy-loaded chunks).
