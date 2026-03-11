---
phase: 13-voter-management-completion
plan: "01"
subsystem: frontend-hooks
tags: [voter, hooks, typescript, tdd, bug-fix]
dependency_graph:
  requires: []
  provides:
    - useSetPrimaryContact unified hook (replaces broken per-type set-primary hooks)
    - VoterFilter interface with all 19 backend-supported fields
    - useVoterLists using correct /lists URL
    - useAddTagToVoter using request body not URL path param
    - Test coverage for all four voter hook files
  affects:
    - Wave 2 tasks that build voter UI components (VOTR-10+)
    - VoterFilterBuilder component (depends on complete VoterFilter type)
tech_stack:
  added: []
  patterns:
    - TDD red-green cycle for all four hook files
    - vi.mock("@/api/client") pattern for ky-based API client mocking
    - renderHook + waitFor from @testing-library/react for async mutation testing
key_files:
  created:
    - web/src/hooks/useVoterContacts.test.ts
    - web/src/hooks/useVoterLists.test.ts
    - web/src/hooks/useVoterTags.test.ts
    - web/src/hooks/useVoters.test.ts
  modified:
    - web/src/types/voter.ts
    - web/src/hooks/useVoterContacts.ts
    - web/src/hooks/useVoterLists.ts
    - web/src/hooks/useVoterTags.ts
decisions:
  - "useSetPrimaryContact accepts contactType union ('phones' | 'emails' | 'addresses') and contactId — single hook replaces three broken per-type hooks"
  - "VoterFilter expanded to 19 fields (added parties, precinct, congressional_district, voted_in, not_voted_in, tags_any, registered_after, registered_before, logic)"
  - "Test pattern uses vi.mock('@/api/client') with mockReturnValue({ json: vi.fn().mockResolvedValue(...) }) — consistent with existing hook test files"
metrics:
  duration: "4 min 30 sec"
  completed_date: "2026-03-11"
  tasks_completed: 3
  files_created: 4
  files_modified: 4
  tests_added: 18
  tests_total: 76
---

# Phase 13 Plan 01: Fix Voter Hook Bugs + Expand VoterFilter Type Summary

**One-liner:** Fixed three broken API patterns in voter hooks (set-primary URL mismatch, voter-lists URL mismatch, tag add body vs path), expanded VoterFilter to all 19 backend fields, and created TDD test scaffolds for all four hook files.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Expand VoterFilter type and fix useVoterContacts hook | 7575859 | voter.ts, useVoterContacts.ts, useVoterContacts.test.ts |
| 2 | Fix useVoterLists URL + fix useVoterTags add endpoint + create hook tests | 7582a41 | useVoterLists.ts, useVoterTags.ts, useVoterLists.test.ts, useVoterTags.test.ts, useVoters.test.ts |
| 3 | Run full test suite to confirm no regressions | (no commit — verification only) | — |

## What Was Built

### VoterFilter Type Expansion (voter.ts)

Expanded from 10 fields to 19 fields. Added:
- `parties?: string[]` — multi-party filtering
- `precinct?: string`
- `congressional_district?: string`
- `voted_in?: string[]` — election participation filter
- `not_voted_in?: string[]` — negative participation filter
- `tags_any?: string[]` — OR-mode tag matching
- `registered_after?: string`
- `registered_before?: string`
- `logic?: "AND" | "OR"` — filter combination logic

### useVoterContacts.ts — Unified Set-Primary Hook

Removed three broken per-type hooks (`useSetPrimaryPhone`, `useSetPrimaryEmail`, `useSetPrimaryAddress`) that each called non-existent per-type endpoints (`/phones/{id}/set-primary`). Replaced with unified `useSetPrimaryContact` calling the correct backend endpoint: `contacts/{contactType}/{contactId}/set-primary`.

### useVoterLists.ts — URL Fix

Replaced all 9 occurrences of `voter-lists` with `lists` in URL strings and query key arrays. The backend route is `/campaigns/{id}/lists`, not `/campaigns/{id}/voter-lists`.

### useVoterTags.ts — Tag Add Fix

Changed `useAddTagToVoter` from appending tagId to the URL path (`/tags/${tagId}`) to sending it as a request body (`POST /tags` with `{ json: { tag_id: tagId } }`). The backend expects `POST /voters/{id}/tags` with body `{ tag_id: string }`.

### Test Scaffolds (4 files, 18 tests)

- `useVoterContacts.test.ts` — 5 tests covering all contactType variants and invalidation
- `useVoterLists.test.ts` — 3 tests covering URL correctness, create POST, filter_query as string
- `useVoterTags.test.ts` — 2 tests covering add body pattern and delete path
- `useVoters.test.ts` — 3 tests covering createVoter, updateVoter, createInteraction

## Verification Results

- TypeScript: `npx tsc --noEmit` — 0 errors
- Tests: 76 passing across 10 test files — 0 failures
- `voted_in` field: present in voter.ts line 48
- `useSetPrimaryContact`: exported from useVoterContacts.ts line 62
- `voter-lists` string: not present anywhere in useVoterLists.ts

## Deviations from Plan

None — plan executed exactly as written. All three bugs (set-primary URL, voter-lists URL, tag body vs path) were confirmed and fixed as specified.

## Self-Check

### Files Exist
- web/src/hooks/useVoterContacts.test.ts: FOUND
- web/src/hooks/useVoterLists.test.ts: FOUND
- web/src/hooks/useVoterTags.test.ts: FOUND
- web/src/hooks/useVoters.test.ts: FOUND

### Commits Exist
- 7575859: FOUND
- 7582a41: FOUND

## Self-Check: PASSED
