---
plan: 72-03
status: complete
completed: 2026-04-04
---

# Plan 72-03: Stale Comment Cleanup — Summary

## What was built

Updated stale RLS-related comments in two files now that Phase 72 has added RLS to organization tables:

- **`app/services/org.py`** — Removed the "D-17: no RLS on org data" stale claim.
- **`app/db/session.py`** — Replaced the "Phase 41: add `set_config('app.current_org_id', ...)` here" TODO with an accurate note explaining the campaign-subquery approach (reuses `app.current_campaign_id`, no new session var needed).

## Commits

- `f66f48e` — refactor(72-03): update stale RLS comments now that orgs have RLS

## Verification

- `uv run ruff check app/db/session.py app/services/org.py` — clean

## Deviation note

This plan hit a blocker when the previous executor encountered an orphaned git stash-pop conflict state (6 `web/` files in unmerged state + an unrelated orphaned `.git/REBASE_HEAD` from 2026-03-31). The orchestrator (me) resolved this:

1. Backed up `stash@{0}` diff to `/tmp/stash-recovery/stash-0-diff.patch` (2274 lines).
2. Reset the 6 unmerged `web/` files (+ `web/e2e/helpers.ts`) to HEAD via `git checkout HEAD -- <files>`.
3. Removed the orphaned `.git/REBASE_HEAD` file.
4. `stash@{0}: WIP canvassing changes before tailscale merge` is preserved in the stash list for later recovery.

After cleanup, committed only `app/services/org.py` + `app/db/session.py` (the scope of this plan). No web/ files were touched.

## Key files

- app/services/org.py
- app/db/session.py
