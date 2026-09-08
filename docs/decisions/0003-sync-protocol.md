# ADR-0003 — Encrypted sync protocol

**Status:** Accepted · 2026-09-08

## Context

Two or more devices edit the same household data, often offline, and the server cannot read
or merge anything it stores.

## Decision

Per-record envelope: `{id (random UUID), householdId, version (int), updatedAt, ciphertext,
deleted}`. Sync is `pull(sinceVersion)` / `push(records[])` with optimistic concurrency: the
server rejects a push whose `version` is stale (409), the client re-pulls, merges, retries.

Conflicts resolve **last-write-wins at record level** using `updatedAt`. Deletes are
**soft** (tombstones) so they propagate; aged tombstones are garbage-collected client-side.
Records are small and independent, which keeps LWW acceptable — the same model already
proven in the owner's paisa-diary project.

## Consequences

- Simultaneous edits of the *same* record can lose one side's change; the UI must show
  "last updated by X" and keep an on-device change history for the rare case.
- The server does no merging, so the protocol is a small, stable contract
  (`docs/api/CONTRACT.md`) — the basis for the M9 Rust reimplementation.
