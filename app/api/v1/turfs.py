"""Turf CRUD endpoints with GeoJSON input/output."""

from __future__ import annotations

import uuid

import fastapi_problem_details as problem
from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, require_role
from app.db.session import get_db
from app.models.turf import TurfStatus
from app.schemas.common import PaginatedResponse, PaginationResponse
from app.schemas.turf import TurfCreate, TurfResponse, TurfUpdate
from app.services.turf import TurfService, _wkb_to_geojson

router = APIRouter()

_service = TurfService()


def _turf_to_response(turf, voter_count: int | None = None) -> TurfResponse:
    """Convert Turf model to TurfResponse with GeoJSON boundary."""
    return TurfResponse(
        id=turf.id,
        name=turf.name,
        description=turf.description,
        status=TurfStatus(turf.status),
        boundary=_wkb_to_geojson(turf.boundary),
        created_by=turf.created_by,
        created_at=turf.created_at,
        updated_at=turf.updated_at,
    )


@router.post(
    "/campaigns/{campaign_id}/turfs",
    response_model=TurfResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def create_turf(
    request: Request,
    campaign_id: uuid.UUID,
    body: TurfCreate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new turf with GeoJSON polygon boundary.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        turf = await _service.create_turf(db, campaign_id, body, user.id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Invalid Polygon",
            detail=str(exc),
            type="invalid-polygon",
        )
    await db.commit()
    return _turf_to_response(turf)


@router.get(
    "/campaigns/{campaign_id}/turfs",
    response_model=PaginatedResponse[TurfResponse],
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def list_turfs(
    request: Request,
    campaign_id: uuid.UUID,
    status_filter: TurfStatus | None = Query(None, alias="status"),
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """List turfs for a campaign with optional status filter.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    items, next_cursor, has_more = await _service.list_turfs(
        db, campaign_id, status_filter=status_filter, cursor=cursor, limit=limit
    )
    return PaginatedResponse[TurfResponse](
        items=[_turf_to_response(t) for t in items],
        pagination=PaginationResponse(next_cursor=next_cursor, has_more=has_more),
    )


@router.get(
    "/campaigns/{campaign_id}/turfs/{turf_id}",
    response_model=TurfResponse,
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def get_turf(
    request: Request,
    campaign_id: uuid.UUID,
    turf_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Get turf detail with voter count.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    turf = await _service.get_turf(db, turf_id)
    if turf is None:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Turf Not Found",
            detail=f"Turf {turf_id} not found",
            type="turf-not-found",
        )
    return _turf_to_response(turf)


@router.patch(
    "/campaigns/{campaign_id}/turfs/{turf_id}",
    response_model=TurfResponse,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def update_turf(
    request: Request,
    campaign_id: uuid.UUID,
    turf_id: uuid.UUID,
    body: TurfUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update turf fields. Status transitions enforced.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        turf = await _service.update_turf(db, turf_id, body)
    except ValueError as exc:
        detail = str(exc)
        if "not found" in detail.lower():
            return problem.ProblemResponse(
                status=status.HTTP_404_NOT_FOUND,
                title="Turf Not Found",
                detail=detail,
                type="turf-not-found",
            )
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Invalid Update",
            detail=detail,
            type="invalid-turf-update",
        )
    await db.commit()
    return _turf_to_response(turf)


@router.delete(
    "/campaigns/{campaign_id}/turfs/{turf_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def delete_turf(
    request: Request,
    campaign_id: uuid.UUID,
    turf_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Delete a turf (cascades to walk lists).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        await _service.delete_turf(db, turf_id)
    except ValueError:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Turf Not Found",
            detail=f"Turf {turf_id} not found",
            type="turf-not-found",
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
