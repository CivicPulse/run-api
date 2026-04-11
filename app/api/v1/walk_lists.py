"""Walk list generation, entry management, canvasser assignment,
and door-knock endpoints."""

from __future__ import annotations

import uuid

import fastapi_problem_details as problem
from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced, get_campaign_db
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, require_role
from app.models.walk_list import WalkListEntryStatus
from app.schemas.canvass import (
    DoorKnockCreate,
    DoorKnockResponse,
    EnrichedEntryResponse,
)
from app.schemas.common import PaginatedResponse, PaginationResponse
from app.schemas.walk_list import (
    CanvasserAssignment,
    WalkListCreate,
    WalkListEntryResponse,
    WalkListResponse,
    WalkListUpdate,
)
from app.services.canvass import CanvassService, DuplicateClientUUIDError
from app.services.walk_list import WalkListService

router = APIRouter()

_walk_list_service = WalkListService()
_canvass_service = CanvassService()


@router.post(
    "/campaigns/{campaign_id}/walk-lists",
    response_model=WalkListResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def generate_walk_list(
    request: Request,
    campaign_id: uuid.UUID,
    body: WalkListCreate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Generate a walk list from a turf with household clustering.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    try:
        walk_list = await _walk_list_service.generate_walk_list(
            db, campaign_id, body, user.id
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Walk List Generation Failed",
            detail=str(exc),
            type="walk-list-generation-failed",
        )
    await db.commit()
    return WalkListResponse.model_validate(walk_list)


@router.get(
    "/campaigns/{campaign_id}/walk-lists",
    response_model=PaginatedResponse[WalkListResponse],
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def list_walk_lists(
    request: Request,
    campaign_id: uuid.UUID,
    turf_id: uuid.UUID | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """List walk lists with optional turf filter.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    items, next_cursor, has_more = await _walk_list_service.list_walk_lists(
        db, campaign_id, turf_id=turf_id, cursor=cursor, limit=limit
    )
    return PaginatedResponse[WalkListResponse](
        items=[WalkListResponse.model_validate(wl) for wl in items],
        pagination=PaginationResponse(next_cursor=next_cursor, has_more=has_more),
    )


@router.get(
    "/campaigns/{campaign_id}/walk-lists/{walk_list_id}",
    response_model=WalkListResponse,
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def get_walk_list(
    request: Request,
    campaign_id: uuid.UUID,
    walk_list_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Get walk list detail.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    walk_list = await _walk_list_service.get_walk_list(db, walk_list_id, campaign_id)
    if walk_list is None:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Walk List Not Found",
            detail=f"Walk list {walk_list_id} not found",
            type="walk-list-not-found",
        )
    return WalkListResponse.model_validate(walk_list)


@router.patch(
    "/campaigns/{campaign_id}/walk-lists/{walk_list_id}",
    response_model=WalkListResponse,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def update_walk_list(
    request: Request,
    campaign_id: uuid.UUID,
    walk_list_id: uuid.UUID,
    body: WalkListUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Update walk list properties (currently: name only).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    if body.name is None:
        return problem.ProblemResponse(
            status=status.HTTP_400_BAD_REQUEST,
            title="No Updates Provided",
            detail="At least one field must be provided for update",
            type="no-updates-provided",
        )
    try:
        walk_list = await _walk_list_service.rename_walk_list(
            db, walk_list_id, campaign_id, body.name
        )
    except ValueError:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Walk List Not Found",
            detail=f"Walk list {walk_list_id} not found",
            type="walk-list-not-found",
        )
    await db.commit()
    return WalkListResponse.model_validate(walk_list)


@router.get(
    "/campaigns/{campaign_id}/walk-lists/{walk_list_id}/entries",
    response_model=PaginatedResponse[WalkListEntryResponse],
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def list_entries(
    request: Request,
    campaign_id: uuid.UUID,
    walk_list_id: uuid.UUID,
    status_filter: WalkListEntryStatus | None = Query(None, alias="status"),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """List walk list entries with pagination and optional status filter.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    items, next_cursor, has_more = await _walk_list_service.get_entries(
        db, walk_list_id, status_filter=status_filter, cursor=cursor, limit=limit
    )
    return PaginatedResponse[WalkListEntryResponse](
        items=[WalkListEntryResponse.model_validate(e) for e in items],
        pagination=PaginationResponse(next_cursor=next_cursor, has_more=has_more),
    )


@router.get(
    "/campaigns/{campaign_id}/walk-lists/{walk_list_id}/entries/enriched",
    response_model=list[EnrichedEntryResponse],
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def list_enriched_entries(
    request: Request,
    campaign_id: uuid.UUID,
    walk_list_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """List walk list entries enriched with voter details and interaction history.

    Returns all entries (up to 500) with voter name, party, age, propensity,
    address, and prior door-knock interaction summary.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    enriched = await _walk_list_service.get_enriched_entries(db, walk_list_id)
    return [EnrichedEntryResponse(**entry) for entry in enriched]


@router.patch(
    "/campaigns/{campaign_id}/walk-lists/{walk_list_id}/entries/{entry_id}",
    response_model=WalkListEntryResponse,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def update_entry_status(
    request: Request,
    campaign_id: uuid.UUID,
    walk_list_id: uuid.UUID,
    entry_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Update entry status to skipped.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    try:
        entry = await _walk_list_service.update_entry_status(
            db, entry_id, WalkListEntryStatus.SKIPPED
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Entry Not Found",
            detail=str(exc),
            type="entry-not-found",
        )
    await db.commit()
    return WalkListEntryResponse.model_validate(entry)


@router.post(
    "/campaigns/{campaign_id}/walk-lists/{walk_list_id}/canvassers",
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def assign_canvasser(
    request: Request,
    campaign_id: uuid.UUID,
    walk_list_id: uuid.UUID,
    body: CanvasserAssignment,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Assign a canvasser to a walk list.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    canvasser = await _walk_list_service.assign_canvasser(
        db, walk_list_id, body.user_id
    )
    await db.commit()
    return {
        "walk_list_id": str(canvasser.walk_list_id),
        "user_id": canvasser.user_id,
        "assigned_at": canvasser.assigned_at.isoformat(),
    }


@router.delete(
    "/campaigns/{campaign_id}/walk-lists/{walk_list_id}/canvassers/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def remove_canvasser(
    request: Request,
    campaign_id: uuid.UUID,
    walk_list_id: uuid.UUID,
    user_id: str,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Remove a canvasser from a walk list.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await _walk_list_service.remove_canvasser(db, walk_list_id, user_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/campaigns/{campaign_id}/walk-lists/{walk_list_id}/canvassers",
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def list_canvassers(
    request: Request,
    campaign_id: uuid.UUID,
    walk_list_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """List canvassers assigned to a walk list.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    canvassers = await _walk_list_service.list_canvassers(db, walk_list_id)
    return [
        {
            "walk_list_id": str(c.walk_list_id),
            "user_id": c.user_id,
            "assigned_at": c.assigned_at.isoformat(),
        }
        for c in canvassers
    ]


@router.post(
    "/campaigns/{campaign_id}/walk-lists/{walk_list_id}/door-knocks",
    response_model=DoorKnockResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def record_door_knock(
    request: Request,
    campaign_id: uuid.UUID,
    walk_list_id: uuid.UUID,
    body: DoorKnockCreate,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Record a door knock attempt.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    try:
        result = await _canvass_service.record_door_knock(
            db, campaign_id, walk_list_id, body, user.id
        )
    except DuplicateClientUUIDError as exc:
        # Plan 110-02 / OFFLINE-01: offline-queue replay of an already-
        # synced outcome. The client's sync engine consumes this via its
        # existing `isConflict` branch (useSyncEngine.ts) and drops the
        # queue item without re-raising to the user.
        return problem.ProblemResponse(
            status=status.HTTP_409_CONFLICT,
            title="Door Knock Duplicate",
            detail=(
                "An outcome with this client_uuid has already been recorded "
                f"(client_uuid={exc.client_uuid})"
            ),
            type="door-knock-duplicate",
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Door Knock Failed",
            detail=str(exc),
            type="door-knock-failed",
        )
    await db.commit()
    return result


@router.delete(
    "/campaigns/{campaign_id}/walk-lists/{walk_list_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def delete_walk_list(
    request: Request,
    campaign_id: uuid.UUID,
    walk_list_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Delete a walk list (cascades to entries and canvassers).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    try:
        await _walk_list_service.delete_walk_list(db, walk_list_id, campaign_id)
    except ValueError:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Walk List Not Found",
            detail=f"Walk list {walk_list_id} not found",
            type="walk-list-not-found",
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
