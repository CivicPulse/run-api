"""Voter list management endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.errors import VoterListNotFoundError
from app.core.security import AuthenticatedUser, require_role
from app.db.session import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.voter import VoterResponse
from app.schemas.voter_list import VoterListCreate, VoterListResponse, VoterListUpdate
from app.schemas.voter_tag import VoterListMemberUpdate
from app.services.voter_list import VoterListService

router = APIRouter()

_service = VoterListService()


@router.post(
    "/campaigns/{campaign_id}/lists",
    response_model=VoterListResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_list(
    campaign_id: uuid.UUID,
    body: VoterListCreate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Create a voter list (static or dynamic).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    voter_list = await _service.create_list(db, campaign_id, body, user.id)
    return VoterListResponse.model_validate(voter_list)


@router.get(
    "/campaigns/{campaign_id}/lists",
    response_model=PaginatedResponse[VoterListResponse],
)
async def list_lists(
    campaign_id: uuid.UUID,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """List all voter lists for a campaign.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    items, pagination = await _service.list_lists(db, cursor=cursor, limit=limit)
    return PaginatedResponse[VoterListResponse](
        items=[VoterListResponse.model_validate(vl) for vl in items],
        pagination=pagination,
    )


@router.get(
    "/campaigns/{campaign_id}/lists/{list_id}",
    response_model=VoterListResponse,
)
async def get_list(
    campaign_id: uuid.UUID,
    list_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Get a voter list by ID.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        voter_list = await _service.get_list(db, list_id)
    except ValueError as exc:
        raise VoterListNotFoundError(list_id) from exc
    return VoterListResponse.model_validate(voter_list)


@router.patch(
    "/campaigns/{campaign_id}/lists/{list_id}",
    response_model=VoterListResponse,
)
async def update_list(
    campaign_id: uuid.UUID,
    list_id: uuid.UUID,
    body: VoterListUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update a voter list.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        voter_list = await _service.update_list(db, list_id, body)
    except ValueError as exc:
        raise VoterListNotFoundError(list_id) from exc
    return VoterListResponse.model_validate(voter_list)


@router.delete(
    "/campaigns/{campaign_id}/lists/{list_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_list(
    campaign_id: uuid.UUID,
    list_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Delete a voter list.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        await _service.delete_list(db, list_id)
    except ValueError as exc:
        raise VoterListNotFoundError(list_id) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/campaigns/{campaign_id}/lists/{list_id}/voters",
    response_model=PaginatedResponse[VoterResponse],
)
async def get_list_voters(
    campaign_id: uuid.UUID,
    list_id: uuid.UUID,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Get voters in a list.

    For static lists, returns members. For dynamic lists, evaluates the
    stored filter query. Supports cursor pagination.
    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        return await _service.get_list_voters(db, list_id, cursor=cursor, limit=limit)
    except ValueError as exc:
        raise VoterListNotFoundError(list_id) from exc


@router.post(
    "/campaigns/{campaign_id}/lists/{list_id}/members",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def add_members(
    campaign_id: uuid.UUID,
    list_id: uuid.UUID,
    body: VoterListMemberUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Add voters to a static list.

    Requires manager+ role. Raises error if list is dynamic.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        await _service.add_members(db, list_id, body.voter_ids)
    except ValueError as exc:
        raise VoterListNotFoundError(list_id) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/campaigns/{campaign_id}/lists/{list_id}/members",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_members(
    campaign_id: uuid.UUID,
    list_id: uuid.UUID,
    body: VoterListMemberUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Remove voters from a static list.

    Requires manager+ role. Raises error if list is dynamic.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        await _service.remove_members(db, list_id, body.voter_ids)
    except ValueError as exc:
        raise VoterListNotFoundError(list_id) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
