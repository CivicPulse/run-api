# Deferred Items — Phase 16 Phone Banking

## Out-of-Scope Issues Discovered During Execution

### useVoterLists test failure (pre-existing)

**File:** `web/src/hooks/useVoterLists.test.ts`
**Test:** "calls GET /api/v1/campaigns/{id}/lists (not voter-lists)"
**Status:** Pre-existing failure from Phase 15 work (uncommitted `useVoterLists.ts` changes in git status at 16-01 start)

**Root cause:** `web/src/hooks/useVoterLists.ts` was modified (Phase 15 uncommitted work) to return `PaginatedResponse<VoterList>.items` instead of `VoterList[]` directly. The test mock `{ json: vi.fn().mockResolvedValue(mockLists) }` returns a plain array — the hook now calls `.then((res) => res.items)` on it, which returns `undefined`, causing `isSuccess` to time out.

**Fix needed:** Update the test mock in `useVoterLists.test.ts` to return `{ items: mockLists }` wrapped in the paginated shape, or commit/integrate the Phase 15 changes properly.

**Not addressed because:** This was a pre-existing failure before Phase 16 execution started. The change to `useVoterLists.ts` is in the initial git status as modified (Phase 15 work), not introduced by Plan 16-01.
