"""Voter search and CRUD endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.errors import VoterNotFoundError
from app.core.security import AuthenticatedUser, require_role
from app.db.session import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.voter import VoterCreateRequest, VoterResponse, VoterUpdateRequest
from app.schemas.voter_filter import VoterFilter
from app.services.voter import VoterService

router = APIRouter()

_service = VoterService()


@router.get(
    "/campaigns/{campaign_id}/voters",
    response_model=PaginatedResponse[VoterResponse],
)
async def list_voters(
    campaign_id: uuid.UUID,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    party: str | None = Query(None),
    city: str | None = Query(None),
    state: str | None = Query(None),
    precinct: str | None = Query(None),
    county: str | None = Query(None),
    has_phone: bool | None = Query(None),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """List and filter voters via query parameters.

    Supports basic filtering via query params. For advanced filtering
    with AND/OR logic, use the POST /voters/search endpoint.
    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    filters = VoterFilter(
        search=search,
        party=party,
        city=city,
        state=state,
        precinct=precinct,
        county=county,
        has_phone=has_phone,
    )
    return await _service.search_voters(db, filters, cursor=cursor, limit=limit)


@router.post(
    "/campaigns/{campaign_id}/voters/search",
    response_model=PaginatedResponse[VoterResponse],
)
async def search_voters(
    campaign_id: uuid.UUID,
    body: VoterFilter,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Search and filter voters with composable query builder.

    Accepts a VoterFilter JSON body with AND/OR logic.
    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    return await _service.search_voters(db, body, cursor=cursor, limit=limit)


@router.get(
    "/campaigns/{campaign_id}/voters/{voter_id}",
    response_model=VoterResponse,
)
async def get_voter(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single voter by ID.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        voter = await _service.get_voter(db, voter_id)
    except ValueError as exc:
        raise VoterNotFoundError(voter_id) from exc
    return VoterResponse.model_validate(voter)


@router.post(
    "/campaigns/{campaign_id}/voters",
    response_model=VoterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_voter(
    campaign_id: uuid.UUID,
    body: VoterCreateRequest,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Create a voter record manually.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    voter = await _service.create_voter(db, campaign_id, body)
    return VoterResponse.model_validate(voter)


@router.patch(
    "/campaigns/{campaign_id}/voters/{voter_id}",
    response_model=VoterResponse,
)
async def update_voter(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    body: VoterUpdateRequest,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update voter fields (partial update).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        voter = await _service.update_voter(db, voter_id, body)
    except ValueError as exc:
        raise VoterNotFoundError(voter_id) from exc
    return VoterResponse.model_validate(voter)
