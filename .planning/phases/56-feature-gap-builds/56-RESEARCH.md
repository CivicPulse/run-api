# Phase 56: Feature Gap Builds - Research

**Researched:** 2026-03-29
**Domain:** Backend API endpoints + Frontend UI for voter interaction notes and walk list rename
**Confidence:** HIGH

## Summary

Phase 56 adds three small, well-scoped features that fill gaps preventing downstream E2E tests: (1) edit a voter interaction note, (2) delete a voter interaction note, and (3) rename a walk list. All three require both backend API changes and frontend UI updates.

The codebase already has established patterns for CRUD operations (see `app/api/v1/voters.py` for PATCH/DELETE patterns), React hooks with TanStack Query mutations, and shared UI components (ConfirmDialog, DropdownMenu, Dialog). The voter interaction model is currently "append-only" by design, with the model docstring stating "Events are never modified or deleted." This design choice must be relaxed specifically for `type="note"` interactions only -- other interaction types (tag_added, import, door_knock, etc.) remain immutable. The walk list model already has a `name` column (String(255)) that simply needs an update endpoint.

**Primary recommendation:** Add PATCH/DELETE endpoints for voter interactions (note type only), add a PATCH endpoint for walk list name, then wire corresponding frontend hooks and UI affordances following existing project patterns.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FEAT-01 | User can edit a voter interaction note (type="note" only) via the voter detail History tab | Backend: Add PATCH endpoint + service method. Frontend: Add edit button per note in HistoryTab, inline textarea or dialog for editing, useUpdateInteraction hook |
| FEAT-02 | User can delete a voter interaction note (type="note" only) via the voter detail History tab | Backend: Add DELETE endpoint + service method. Frontend: Add delete button per note in HistoryTab, ConfirmDialog for confirmation, useDeleteInteraction hook |
| FEAT-03 | User can rename a walk list from the canvassing page or walk list detail page | Backend: Add PATCH endpoint for walk list name. Frontend: Add rename affordance (inline edit or dialog) on canvassing index and walk list detail pages, useRenameWalkList hook |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack:** Python 3.13, FastAPI, SQLAlchemy (async), PostgreSQL + PostGIS, ZITADEL (OIDC auth)
- **Frontend:** React, TypeScript, TanStack Router/Query, shadcn/ui, Tailwind CSS
- **Package manager:** Always use `uv` (not pip/poetry)
- **Python linting:** `uv run ruff check .` / `uv run ruff format .`
- **Tests:** `uv run pytest` (asyncio_mode=auto)
- **Line length:** 88 chars
- **Ruff rules:** E, F, I, N, UP, B, SIM, ASYNC (ignore B008 for FastAPI Depends)
- **Visual verification:** After any UI changes, use Playwright MCP or similar to take screenshots
- **Git:** Conventional commits, commit on branches, never push unless requested

## Standard Stack

No new libraries needed. All features use the existing stack.

### Core (already installed)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| FastAPI | API framework | Project standard |
| SQLAlchemy (async) | ORM + async DB | Project standard |
| Pydantic v2 | Request/response schemas | Project standard |
| TanStack Query | Frontend data fetching/mutations | Project standard |
| shadcn/ui | UI components (Dialog, DropdownMenu, AlertDialog) | Project standard |
| ky | HTTP client | Project standard via `@/api/client` |
| sonner | Toast notifications | Project standard |
| lucide-react | Icons | Project standard |

### No New Dependencies Required
This phase uses only existing dependencies. No `uv add` or `npm install` needed.

## Architecture Patterns

### Backend Pattern: PATCH/DELETE Endpoints

The project has a consistent pattern for CRUD endpoints. Follow the voter PATCH/DELETE pattern from `app/api/v1/voters.py`:

**Endpoint pattern:**
```python
# PATCH: partial update
@router.patch(
    "/campaigns/{campaign_id}/voters/{voter_id}/interactions/{interaction_id}",
    response_model=InteractionResponse,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def update_voter_interaction(
    request: Request,
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    interaction_id: uuid.UUID,
    body: InteractionUpdateRequest,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    await ensure_user_synced(user, db)
    # ... validation + service call
    await db.commit()
    return InteractionResponse.model_validate(interaction)

# DELETE: remove
@router.delete(
    "/campaigns/{campaign_id}/voters/{voter_id}/interactions/{interaction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def delete_voter_interaction(
    request: Request,
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    interaction_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    await ensure_user_synced(user, db)
    # ... validation + service call
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

**Key conventions:**
- Rate limiting: `@limiter.limit("30/minute", key_func=get_user_or_ip_key)` for mutating endpoints
- Auth: `require_role("volunteer")` for note operations (matching existing create interaction role)
- Error handling: `problem.ProblemResponse` for 404/400, `HTTPException` for explicit errors
- Always call `ensure_user_synced(user, db)` first
- Commit in the route handler, not in the service

### Backend Pattern: Service Layer

Service methods follow this pattern from `VoterInteractionService`:

```python
async def update_note(
    self,
    session: AsyncSession,
    interaction_id: uuid.UUID,
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    payload: dict,
) -> VoterInteraction:
    result = await session.execute(
        select(VoterInteraction).where(
            VoterInteraction.id == interaction_id,
            VoterInteraction.campaign_id == campaign_id,
            VoterInteraction.voter_id == voter_id,
            VoterInteraction.type == InteractionType.NOTE,
        )
    )
    interaction = result.scalar_one_or_none()
    if interaction is None:
        raise ValueError(f"Note {interaction_id} not found")
    interaction.payload = payload
    await session.flush()
    return interaction
```

### Frontend Pattern: Mutation Hook

Follow `useCreateInteraction` from `web/src/hooks/useVoters.ts`:

```typescript
export function useUpdateInteraction(campaignId: string, voterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ interactionId, payload }: { interactionId: string; payload: Record<string, unknown> }) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/voters/${voterId}/interactions/${interactionId}`, { json: { payload } })
        .json<VoterInteraction>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["voters", campaignId, voterId, "interactions"],
      })
    },
  })
}
```

### Frontend Pattern: Action Menu on List Items

Use shadcn `DropdownMenu` with `MoreVertical` icon for per-item actions. This is a standard pattern in the codebase (see canvasser badges with inline remove buttons). For notes:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" className="h-6 w-6">
      <MoreVertical className="h-3 w-3" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => setEditingInteractionId(interaction.id)}>
      <Pencil className="mr-2 h-3 w-3" /> Edit
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => setDeletingInteractionId(interaction.id)}>
      <Trash2 className="mr-2 h-3 w-3 text-destructive" /> Delete
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Frontend Pattern: Walk List Rename

Two approaches available:
1. **Inline edit** -- click the name text, it becomes an input field, press Enter/blur to save
2. **Dialog** -- click a pencil icon, opens a small Dialog with name input

Recommendation: Use a **Dialog** approach (consistent with WalkListGenerateDialog pattern) for the walk list detail page, and a **DropdownMenu with Rename option** on the canvassing index table rows. The dialog is simpler to implement and more accessible.

### Anti-Patterns to Avoid
- **Do NOT add `updated_at` to VoterInteraction model** -- the model is append-only for all types except note. Adding a timestamp column would be a schema migration. Instead, accept that notes store their update time implicitly through the API response.
- **Do NOT modify the model docstring to remove "append-only"** -- keep the docstring accurate but add a specific exemption comment for notes.
- **Do NOT allow edit/delete of non-note interaction types** -- these are system-generated events. Both API and UI must enforce type="note" restriction.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirmation dialog for delete | Custom modal | `ConfirmDialog` from `@/components/shared/ConfirmDialog` | Already exists with destructive variant, isPending support |
| Action menu per item | Custom buttons | shadcn `DropdownMenu` | Accessible, keyboard-navigable, standard pattern |
| Toast notifications | Alert div | `toast` from `sonner` | Already wired throughout app |
| Form validation | Manual checks | `z.string().min(1)` from Zod | Consistent with project pattern |

## Common Pitfalls

### Pitfall 1: Not Restricting Edit/Delete to Note Type Only
**What goes wrong:** Allowing edit/delete of system-generated interactions (tag_added, import, door_knock) corrupts the event log integrity
**Why it happens:** The API endpoint receives an interaction_id but doesn't check the type
**How to avoid:** Add explicit `VoterInteraction.type == InteractionType.NOTE` to the WHERE clause in both update and delete service methods. Return 400 if the interaction exists but is not a note type.
**Warning signs:** E2E tests pass for notes but system interactions go missing

### Pitfall 2: VoterInteraction Model is Append-Only by Comment
**What goes wrong:** The model docstring says "Events are never modified or deleted" and the unit test `test_service_has_no_update_or_delete_methods` explicitly asserts this
**Why it happens:** The append-only design was intentional for audit trail integrity
**How to avoid:** (1) Update the model docstring to exempt note type, (2) Update or remove the unit test that checks for no update/delete methods, (3) Add clear comments that only note-type interactions are mutable
**Warning signs:** Existing unit tests fail unexpectedly

### Pitfall 3: Missing Query Invalidation for Walk List Rename
**What goes wrong:** After renaming a walk list, the name appears stale on the canvassing index page
**Why it happens:** The canvassing index uses `queryKey: ["walk-lists", campaignId]` while the detail page uses `["walk-lists", campaignId, walkListId]`. Both must be invalidated.
**How to avoid:** Invalidate both query keys in the mutation's onSuccess callback
**Warning signs:** Name updates on detail page but not on index page

### Pitfall 4: Forgetting `campaign_id` Scoping in Service Queries
**What goes wrong:** A user could edit/delete an interaction from another campaign by guessing IDs
**Why it happens:** The service query only filters by interaction_id, not campaign_id
**How to avoid:** Always include `campaign_id` and `voter_id` in the WHERE clause, not just the interaction_id. The `get_campaign_db` dependency provides RLS enforcement, but belt-and-suspenders is the project pattern.
**Warning signs:** Cross-campaign data leakage in security tests

### Pitfall 5: DropdownMenu Inside Table Row Click Handlers
**What goes wrong:** Clicking the dropdown menu on a walk list row navigates to the detail page instead of opening the menu
**Why it happens:** The existing canvassing index uses `<Link>` inside table cells -- the dropdown needs `e.stopPropagation()` or z-index handling
**How to avoid:** Follow the turf card pattern in canvassing/index.tsx which uses `className="relative z-20"` for buttons and `e.preventDefault()` on click
**Warning signs:** Cannot open rename menu because the row navigates away

## Code Examples

### Backend: New Schema for Interaction Update

```python
# app/schemas/voter_interaction.py (addition)
class InteractionUpdateRequest(BaseSchema):
    """Update a note interaction's payload (notes only)."""
    payload: dict = Field(...)
```

### Backend: Walk List Update Schema

```python
# app/schemas/walk_list.py (addition)
class WalkListUpdate(BaseSchema):
    """Partial update for walk list fields."""
    name: str | None = None
```

### Backend: Walk List PATCH Endpoint

```python
@router.patch(
    "/campaigns/{campaign_id}/walk-lists/{walk_list_id}",
    response_model=WalkListResponse,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def update_walk_list(
    request: Request,
    campaign_id: uuid.UUID,
    walk_list_id: uuid.UUID,
    body: WalkListUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    await ensure_user_synced(user, db)
    walk_list = await _walk_list_service.update_walk_list(
        db, walk_list_id, body
    )
    if walk_list is None:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Walk List Not Found",
            detail=f"Walk list {walk_list_id} not found",
            type="walk-list-not-found",
        )
    await db.commit()
    return WalkListResponse.model_validate(walk_list)
```

### Frontend: useRenameWalkList Hook

```typescript
export function useRenameWalkList(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ walkListId, name }: { walkListId: string; name: string }) =>
      api.patch(`api/v1/campaigns/${campaignId}/walk-lists/${walkListId}`, { json: { name } }).json<WalkListResponse>(),
    onSuccess: (_, { walkListId }) => {
      queryClient.invalidateQueries({ queryKey: ["walk-lists", campaignId] })
      queryClient.invalidateQueries({ queryKey: ["walk-lists", campaignId, walkListId] })
      toast.success("Walk list renamed")
    },
    onError: () => toast.error("Failed to rename walk list"),
  })
}
```

### Frontend: Note Actions in HistoryTab

```tsx
// Only show actions for note-type interactions
{interaction.type === "note" && (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
        <MoreVertical className="h-3 w-3" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => startEdit(interaction)}>
        <Pencil className="mr-2 h-3 w-3" /> Edit
      </DropdownMenuItem>
      <DropdownMenuItem
        className="text-destructive"
        onClick={() => setDeletingId(interaction.id)}
      >
        <Trash2 className="mr-2 h-3 w-3" /> Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Append-only interactions (all types) | Append-only except notes (mutable) | Phase 56 | Notes can be edited/deleted; all other interaction types remain immutable |

**Key design decision:** The VoterInteraction model was designed as append-only. Phase 56 introduces a deliberate, controlled exception for `type="note"` only. The docstring and unit tests must be updated to reflect this. System-generated events (tag_added, import, door_knock, phone_call, survey_response, contact_updated) remain permanently immutable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest with pytest-asyncio (asyncio_mode=auto) |
| Config file | `pyproject.toml` [tool.pytest.ini_options] |
| Quick run command | `uv run pytest tests/unit/test_voter_interactions.py tests/unit/test_walk_lists.py -x` |
| Full suite command | `uv run pytest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEAT-01 | Edit voter interaction note via API | unit | `uv run pytest tests/unit/test_voter_interactions.py::TestVoterInteractionService::test_update_note -x` | Needs new test |
| FEAT-01 | Edit note rejects non-note types | unit | `uv run pytest tests/unit/test_voter_interactions.py::TestVoterInteractionService::test_update_rejects_non_note -x` | Needs new test |
| FEAT-02 | Delete voter interaction note via API | unit | `uv run pytest tests/unit/test_voter_interactions.py::TestVoterInteractionService::test_delete_note -x` | Needs new test |
| FEAT-02 | Delete rejects non-note types | unit | `uv run pytest tests/unit/test_voter_interactions.py::TestVoterInteractionService::test_delete_rejects_non_note -x` | Needs new test |
| FEAT-03 | Rename walk list via API | unit | `uv run pytest tests/unit/test_walk_lists.py::TestWalkListService::test_rename_walk_list -x` | Needs new test |
| FEAT-01 | Edit note UI renders and saves | manual/e2e | Playwright MCP screenshot verification | Deferred to Phase 58 (E2E-10) |
| FEAT-02 | Delete note UI confirms and removes | manual/e2e | Playwright MCP screenshot verification | Deferred to Phase 58 (E2E-10) |
| FEAT-03 | Rename walk list UI on canvassing/detail pages | manual/e2e | Playwright MCP screenshot verification | Deferred to Phase 59 (E2E-13) |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_voter_interactions.py tests/unit/test_walk_lists.py -x`
- **Per wave merge:** `uv run pytest`
- **Phase gate:** Full suite green + ruff check/format clean before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Update `tests/unit/test_voter_interactions.py` -- add tests for update_note, delete_note, reject non-note types
- [ ] Update `tests/unit/test_walk_lists.py` -- add test for rename_walk_list
- [ ] Remove or update `test_service_has_no_update_or_delete_methods` test that will fail once new methods are added

## Open Questions

1. **Should note edit preserve the original text?**
   - What we know: The existing `record_correction` service method creates a new event referencing the original. The requirements say "edit" which implies in-place update.
   - What's unclear: Whether there should be an audit trail of the edit (original text preserved in some way)
   - Recommendation: Implement as a true in-place update of `payload.text`. The requirements explicitly say "save updated text" which implies replacement, not append. If audit trail is needed later, it can be added as a future enhancement.

2. **Role requirement for note edit/delete**
   - What we know: Creating interactions requires `volunteer+`. Deleting voters requires `manager+`.
   - What's unclear: Whether note edit/delete should be `volunteer+` (anyone who can create) or `manager+` (more restrictive)
   - Recommendation: Use `volunteer+` -- same as note creation. The user who created the note should be able to edit/delete it. If ownership-based restriction is needed later, that's a separate concern.

## Sources

### Primary (HIGH confidence)
- Project codebase: `app/api/v1/voter_interactions.py` -- current GET/POST endpoints
- Project codebase: `app/api/v1/walk_lists.py` -- current walk list endpoints (no PATCH for name)
- Project codebase: `app/api/v1/voters.py` -- reference PATCH/DELETE pattern
- Project codebase: `app/services/voter_interaction.py` -- current service with record_interaction and record_correction
- Project codebase: `app/services/walk_list.py` -- current service, no rename method
- Project codebase: `app/models/voter_interaction.py` -- model is append-only by design
- Project codebase: `app/models/walk_list.py` -- WalkList.name is String(255)
- Project codebase: `web/src/components/voters/HistoryTab.tsx` -- current UI with no edit/delete
- Project codebase: `web/src/hooks/useVoters.ts` -- useCreateInteraction pattern
- Project codebase: `web/src/hooks/useWalkLists.ts` -- no rename hook
- Project codebase: `web/src/routes/campaigns/$campaignId/canvassing/index.tsx` -- walk list table
- Project codebase: `web/src/routes/campaigns/$campaignId/canvassing/walk-lists/$walkListId.tsx` -- walk list detail
- Project codebase: `web/src/components/shared/ConfirmDialog.tsx` -- reusable destructive confirm
- Project codebase: `tests/unit/test_voter_interactions.py` -- test_service_has_no_update_or_delete_methods will break
- Project codebase: `tests/unit/test_walk_lists.py` -- existing patterns for walk list tests

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all existing patterns
- Architecture: HIGH - following established project CRUD patterns verbatim
- Pitfalls: HIGH - identified from direct codebase inspection (append-only model, existing unit test conflict, query invalidation needs)

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable -- internal codebase patterns unlikely to change)
