# Phase 37: Offline Sync Integration Fixes - Research

**Researched:** 2026-03-16
**Domain:** TanStack Query v5 mutation error handling, React Query cache invalidation
**Confidence:** HIGH

## Summary

Phase 37 is a targeted bug-fix phase addressing two integration defects (INT-01 and INT-02) identified in the v1.4 milestone audit. Both issues are well-diagnosed with specific file locations, root causes, and prescribed fixes. The changes are small in scope (2-3 files, under 20 lines of code total) but critical for correct offline UX.

INT-01 is caused by TanStack Query v5's behavior of firing BOTH the `useMutation` hook-level `onError` AND the call-site `.mutate(payload, { onError })` callback when a mutation fails. The hook-level handler in `useDoorKnockMutation` unconditionally calls `revertOutcome()`, undoing the optimistic UI even when the call-site handler in `useCanvassingWizard` correctly queues the item for offline sync. INT-02 is a missing cache invalidation -- `drainQueue` invalidates walk-list and phone-banking queries but omits the `field-me` query that powers the hub's AssignmentCard progress counters.

**Primary recommendation:** Remove the `onError` handler from `useDoorKnockMutation` entirely (move error handling responsibility to call sites), and add `field-me` query invalidation to `drainQueue`'s post-sync block.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SYNC-01 | Volunteer can record door-knock outcomes while offline; they queue locally | INT-01 fix ensures optimistic UI is not reverted when offline queueing occurs |
| SYNC-04 | Volunteer receives updated walk list status when connectivity resumes | INT-02 fix ensures hub AssignmentCard progress updates after drainQueue completes |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-query | 5.90.21 | Mutation and query management | Already in use; v5 dual-onError behavior is the root cause of INT-01 |
| zustand | 5.x | Client state (canvassingStore, offlineQueueStore) | Already in use for wizard and offline queue state |
| vitest | 4.x | Unit testing | Existing test framework with full coverage of useSyncEngine |

No new packages needed. This is purely a fix phase.

## Architecture Patterns

### Pattern 1: TanStack Query v5 Dual onError Firing

**What:** In TanStack Query v5, when `useMutation` defines an `onError` callback AND the `.mutate()` call-site provides its own `onError`, BOTH fire on error. The hook-level fires first, then the call-site handler.

**When it matters:** Any mutation where the call-site wants to override or supplement error handling (e.g., offline queueing instead of reverting).

**Current code (broken):**
```typescript
// useCanvassing.ts - hook-level onError ALWAYS fires
useMutation({
  onError: (_err, data) => {
    revertOutcome(data.walk_list_entry_id)  // <-- fires even during offline
    toast.error("Failed to save outcome.")
  },
})

// useCanvassingWizard.ts - call-site onError ALSO fires
doorKnockMutation.mutate(payload, {
  onError: (err) => {
    if (err instanceof TypeError) {
      // Queue for offline -- but revert already happened above!
      useOfflineQueueStore.getState().push(...)
    }
  },
})
```

**Fix pattern:**
```typescript
// useCanvassing.ts - remove onError entirely from hook
useMutation({
  mutationFn: (data: DoorKnockCreate) => api.post(...).json(),
  onMutate: (data) => {
    recordOutcome(data.walk_list_entry_id, data.result_code)
  },
  onSuccess: () => {
    queryClient.invalidateQueries(...)
  },
  // NO onError here -- call sites handle their own error logic
})
```

This delegates all error handling to call sites, which already have the full context (network error vs server error) to decide whether to revert or queue.

### Pattern 2: Post-Sync Query Invalidation

**What:** After `drainQueue` replays all queued mutations, it must invalidate every query whose data may have changed.

**Current code (incomplete):**
```typescript
// useSyncEngine.ts drainQueue - invalidates these:
// - ["walk-list-entries-enriched", campaignId, resourceId]
// - ["campaigns", campaignId, "phone-bank-sessions", resourceId]
// Missing: ["field-me", campaignId]
```

**Fix pattern:**
```typescript
// After existing invalidation block, add:
for (const campaignId of syncedCampaignIds) {
  invalidationPromises.push(
    queryClient.invalidateQueries({
      queryKey: ["field-me", campaignId],
    })
  )
}
```

The `syncedCampaignIds` set is already collected during drain but currently unused for invalidation. The `field-me` endpoint returns assignment data including progress counters, which the hub's AssignmentCard reads.

### Anti-Patterns to Avoid
- **Dual onError with conflicting intent:** Never define hook-level onError for revert if any call site may want to suppress revert (queue offline instead).
- **Partial invalidation after sync:** When draining an offline queue, invalidate ALL queries that could be affected, not just the obvious ones.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error type detection | Custom error class hierarchy | `instanceof TypeError` check | TanStack Query wraps fetch errors as TypeError for network failures; this is already the pattern in the codebase |
| Query invalidation tracking | Manual dirty-flag system | TanStack Query `invalidateQueries` | Built-in refetch-on-invalidate handles all cache/refetch coordination |

## Common Pitfalls

### Pitfall 1: Forgetting Other Call Sites of useDoorKnockMutation
**What goes wrong:** Removing `onError` from the hook means ALL call sites must handle errors themselves.
**Why it happens:** `useDoorKnockMutation` may be called from places other than `handleOutcome` in `useCanvassingWizard`.
**How to avoid:** Grep for all usages of `useDoorKnockMutation` and `doorKnockMutation.mutate` to verify every call site has its own error handling.
**Warning signs:** A mutation call with no call-site `onError` will silently swallow errors after the hook-level handler is removed.

### Pitfall 2: handleBulkNotHome Also Calls doorKnockMutation.mutate
**What goes wrong:** The `handleBulkNotHome` callback in `useCanvassingWizard.ts:189-215` also calls `doorKnockMutation.mutate` with its own `onError`. This already has the correct pattern (TypeError check with offline queue fallback), so it will work correctly once the hook-level onError is removed.
**How to avoid:** Verify `handleBulkNotHome` error handling is consistent with `handleOutcome`.

### Pitfall 3: Field-me Invalidation Needs campaignId
**What goes wrong:** `drainQueue` receives `queryClient` but not `campaignId` directly. It must extract campaign IDs from the synced items.
**Why it happens:** The function signature only takes `QueryClient`.
**How to avoid:** The `syncedCampaignIds` set already tracks all campaign IDs from synced items. Use it directly.

## Code Examples

### Fix 1: Remove onError from useDoorKnockMutation (useCanvassing.ts)
```typescript
// Source: web/src/hooks/useCanvassing.ts lines 19-38
export function useDoorKnockMutation(campaignId: string, walkListId: string) {
  const queryClient = useQueryClient()
  const { recordOutcome } = useCanvassingStore.getState()  // remove revertOutcome

  return useMutation({
    mutationFn: (data: DoorKnockCreate) =>
      api.post(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/door-knocks`, { json: data }).json(),
    onMutate: (data) => {
      recordOutcome(data.walk_list_entry_id, data.result_code)
    },
    // onError REMOVED -- call sites handle error logic
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["walk-list-entries-enriched", campaignId, walkListId] })
    },
  })
}
```

### Fix 2: Add field-me invalidation to drainQueue (useSyncEngine.ts)
```typescript
// Source: web/src/hooks/useSyncEngine.ts, inside the if (syncedResourceIds.size > 0) block
// Add after the existing invalidation loop (line ~114):
for (const campaignId of syncedCampaignIds) {
  invalidationPromises.push(
    queryClient.invalidateQueries({
      queryKey: ["field-me", campaignId],
    })
  )
}
```

## State of the Art

No new patterns or libraries needed. This phase applies existing patterns correctly.

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hook-level onError for all error handling | Call-site onError for context-specific handling | TanStack Query v5 (2023) | Both handlers fire; hook-level must be generic or absent |

## Open Questions

None. Both defects are fully diagnosed with clear fixes prescribed in the milestone audit.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.x |
| Config file | web/vitest.config.ts |
| Quick run command | `cd web && npx vitest run src/hooks/useSyncEngine.test.ts --reporter=verbose` |
| Full suite command | `cd web && npx vitest run --reporter=verbose` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | Offline door-knock does not revert optimistic UI | unit | `cd web && npx vitest run src/hooks/useSyncEngine.test.ts -t "does not revert" -x` | Wave 0 |
| SYNC-01 | Hook-level onError removed from useDoorKnockMutation | unit | `cd web && npx vitest run src/hooks/useCanvassing.test.ts -x` | Wave 0 (new file) |
| SYNC-04 | drainQueue invalidates field-me query after sync | unit | `cd web && npx vitest run src/hooks/useSyncEngine.test.ts -t "field-me" -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run src/hooks/useSyncEngine.test.ts src/hooks/useCanvassing.test.ts --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/hooks/useSyncEngine.test.ts` -- add test for field-me invalidation after drain
- [ ] `web/src/hooks/useSyncEngine.test.ts` -- add test verifying optimistic UI not reverted when hook-level onError absent
- [ ] Consider adding `web/src/hooks/useCanvassing.test.ts` if useDoorKnockMutation warrants standalone hook tests (optional -- call-site behavior already covered by useSyncEngine tests)

*(Existing test infrastructure in `useSyncEngine.test.ts` covers most needs; only 2-3 new test cases required)*

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `web/src/hooks/useCanvassing.ts`, `web/src/hooks/useCanvassingWizard.ts`, `web/src/hooks/useSyncEngine.ts`
- Direct code inspection of `web/src/hooks/useSyncEngine.test.ts` (existing test patterns)
- `.planning/v1.4-MILESTONE-AUDIT.md` (INT-01, INT-02 defect descriptions and prescribed fixes)
- TanStack Query v5.90.21 installed in project (confirmed version)

### Secondary (MEDIUM confidence)
- TanStack Query v5 documentation on dual onError behavior (well-known v5 behavioral change from v4)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing libraries
- Architecture: HIGH - both fixes are prescribed in audit with exact file/line references, confirmed by code inspection
- Pitfalls: HIGH - limited scope (2 files, ~15 lines changed), all call sites verified

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable, no external dependencies changing)
