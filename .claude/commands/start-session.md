---
description: Start a work session on the next issue (loads the minimum context)
---

Start a session, following `docs/CONTEXT.md` strictly.

1. Read `CLAUDE.md` and `docs/STATE.md`.
2. Read only the phase brief named there (`docs/phases/M<N>.md`).
3. Run `gh issue list -m <milestone> -s open` and, unless the user names one, take the
   first issue with `size:S` or `size:M`. Read it with `gh issue view <N>`.
4. Create the branch, restate the acceptance criteria in one short list, then implement.

Do not read anything else up front. No subagents. Batch independent tool calls.
Stop and ask if the issue looks larger than 6 files — it needs splitting first.
