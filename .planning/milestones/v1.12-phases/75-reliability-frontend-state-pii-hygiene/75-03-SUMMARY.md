---
phase: 75-reliability-frontend-state-pii-hygiene
plan: 03
subsystem: frontend-state
tags: [pii, security, zustand, sessionStorage, callingStore, REL-03]
requirements: [REL-03]
dependency-graph:
  requires: [75-01]
  provides: ["Calling store PII sanitizer at persist boundary"]
  affects: ["web/src/stores/callingStore.ts"]
tech-stack:
  added: []
  patterns: ["persist partialize + merge sanitizer (mirrors canvassingStore)"]
key-files:
  created: []
  modified:
    - web/src/stores/callingStore.ts
decisions:
  - "Match canvassingStore sanitizePersistedCanvassingState pattern exactly for store symmetry"
  - "Wire BOTH partialize AND merge (defense-in-depth: filter on save + sanitize on rehydrate)"
  - "Strip all voter PII fields (name, phones, attempts, dialed number) keeping only IDs + counters"
  - "Bump persist version to 1 to invalidate any legacy PII-containing state"
metrics:
  duration: "~5m"
  completed: 2026-04-04
  tasks: 1
  files_changed: 1
---

# Phase 75 Plan 03: callingStore PII Sanitizer Summary

Added `sanitizePersistedCallingState` + `partialize`/`merge` wiring to `callingStore` to strip voter PII (name, phone numbers, attempt history, dialed number) before it ever touches sessionStorage — closing C16 (REL-03).

## What Was Built

- **`sanitizePersistedCallingState(persistedState)`** — exported function mirroring `canvassingStore.sanitizePersistedCanvassingState`. Accepts `unknown`, returns `Partial<CallingStoreData>`. Handles null/undefined/non-object input, unwraps `{ state: {...} }` zustand envelope, validates each field with type guards.
- **`sanitizeEntry(value)`** — per-entry PII scrubber. Keeps `id`, `voter_id`, `attempt_count`, `priority_score`; forces `voter_name=null`, `phone_numbers=[]`, `phone_attempts=null`.
- **`CallingStoreData` type + `defaultCallingStoreData()`** — separates persistable fields from actions (matches canvassingStore shape).
- **persist config updated:** `version: 1`, `partialize` (strips on save), `merge` (sanitizes on rehydrate).

In-memory runtime state is unchanged — full entries with PII still flow through `startSession`/`addEntries` and drive the UI. Only the persist boundary is sanitized.

## Tasks Executed

| Task | Name                                                   | Commit   | Files                               |
| ---- | ------------------------------------------------------ | -------- | ----------------------------------- |
| 1    | Add sanitizer + wire partialize/merge into persist     | d822818  | web/src/stores/callingStore.ts      |

## Verification Results

- `npx vitest run src/stores/callingStore.test.ts` → **23/23 passing** (10 pre-existing + 13 new sanitizer tests from Plan 01)
- `npx tsc --noEmit` → **clean, no errors**
- PII assertions verified: `voter_name`, `phone_numbers`, `phone_attempts`, `phoneNumberUsed`, E.164 numbers (`+1555...`), "John Smith", "no_answer" all absent from serialized output.
- Envelope unwrapping verified through `{ state: {...} }` round-trip test.

## Deviations from Plan

None — plan executed exactly as written. One minor TypeScript narrowing: used `as { state?: unknown }` cast inside the envelope-unwrap check (plan pseudocode relied on implicit narrowing that TS strict didn't accept). Behavior identical.

## Self-Check: PASSED

- FOUND: web/src/stores/callingStore.ts (modified, exports sanitizePersistedCallingState)
- FOUND: commit d822818
- FOUND: 23/23 tests passing
- FOUND: tsc clean
