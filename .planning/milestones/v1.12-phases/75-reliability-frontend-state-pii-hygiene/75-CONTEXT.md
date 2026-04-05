# Phase 75: Reliability — Frontend State & PII Hygiene - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Offline sync never deadlocks, failing items exit the queue, voter PII does not leak to sessionStorage, and mutations invalidate all hook consumers. Closes C14 (isSyncing permanent lock), C15 (sync queue halting + infinite retry), C16 (callingStore PII leak), H29 (useFieldOps query key duplication) from CODEBASE-REVIEW-2026-04-04.md.

</domain>

<decisions>
## Implementation Decisions

### Sync Engine Resilience
- **C14 (REL-01)**: Wrap `useSyncEngine` drain body in `try/finally` with `setSyncing(false)` in `finally` block. Guarantees lock release on every exception path.
- **C15 queue halt (REL-02)**: Replace `break` on transient errors with `continue` — one bad item must not stall entire queue.
- **C15 MAX_RETRY**: When `retryCount >= MAX_RETRY`, **remove the item from the queue** and show a user-visible toast: "Sync failed after 3 attempts, item removed" with brief item description (e.g., "door knock for 123 Main St").
- **MAX_RETRY value**: **3** retries, defined as a module-level constant.

### PII & Query Key Consolidation
- **C16 (REL-03)**: Match `canvassingStore.sanitizePersistedCanvassingState` pattern exactly — add both `partialize` and rehydration sanitizer to `callingStore`. Keeps stores symmetric and auditable.
- **C16 scope of stripping**: All voter fields — names, phone numbers, attempt history, contact preferences. Persist only IDs + timestamps needed for state recovery.
- **H29 (REL-08)**: Update `useFieldOps` hooks to import and reuse query keys from dedicated hook files (e.g. `callListKeys.all(campaignId)`). Mutations will then invalidate both consumers.
- **Test strategy**: Vitest unit tests. Mock sessionStorage, assert sanitized output. Test MAX_RETRY removal triggers toast.

### Claude's Discretion
- Exact toast text copy — Claude to choose friendly, non-alarming phrasing consistent with existing app tone.
- Whether to add a "retry" button to the toast for manual requeue — at Claude's discretion if trivial.
- How to name the MAX_RETRY constant — match existing constant naming in useSyncEngine file.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `canvassingStore.sanitizePersistedCanvassingState` — direct pattern reference for C16 fix.
- `sonner` toast library (per STATE.md / project stack) for user-visible notifications.
- Query keys pattern: dedicated hook files export a `*Keys` object (e.g. `callListKeys`, `voterKeys`).

### Established Patterns
- Zustand stores with `persist` middleware for sessionStorage.
- Vitest tests in `*.test.ts` alongside hook files.
- TanStack Query `invalidateQueries({ queryKey: ... })` for mutation invalidation.

### Integration Points
- `web/src/hooks/useSyncEngine.ts:43-96` — isSyncing lock + queue drain logic.
- `web/src/stores/callingStore.ts:181-186` — persist config needs partialize + sanitizer.
- `web/src/stores/canvassingStore.ts` — reference implementation.
- `web/src/hooks/useFieldOps.ts` — query key duplication sites.
- `web/src/hooks/useCallLists.ts`, etc. — source of canonical query keys.

</code_context>

<specifics>
## Specific Ideas

- Follow exact fix snippets from CODEBASE-REVIEW C14, C15, C16.
- Toast should include actionable context (item type + identifier) so user knows what was dropped.
- Vitest tests should assert both the happy path (lock released normally) AND the exception path (lock released on throw).

</specifics>

<deferred>
## Deferred Ideas

- Dead-letter queue for permanently failed items — deferred; current simple toast+remove approach keeps UI uncluttered.
- Exponential backoff between retries — deferred; focus on correctness first.
- Broader store audit beyond callingStore — out of scope (canvassingStore already correct, others unexamined).

</deferred>
