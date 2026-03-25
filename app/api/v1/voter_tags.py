"""Voter tag management endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced, get_campaign_db
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, require_role
from app.schemas.voter_tag import VoterTagAssign, VoterTagCreate, VoterTagResponse
from app.services.voter import VoterService

router = APIRouter()

_service = VoterService()


@router.post(
    "/campaigns/{campaign_id}/tags",
    response_model=VoterTagResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def create_tag(
    request: Request,
    campaign_id: uuid.UUID,
    body: VoterTagCreate,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Create a campaign-scoped voter tag.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    tag = await _service.create_tag(db, campaign_id, body.name)
    return VoterTagResponse.model_validate(tag)


@router.get(
    "/campaigns/{campaign_id}/tags",
    response_model=list[VoterTagResponse],
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def list_tags(
    request: Request,
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """List all tags for a campaign.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    tags = await _service.list_tags(db, campaign_id)
    return [VoterTagResponse.model_validate(t) for t in tags]


@router.post(
    "/campaigns/{campaign_id}/voters/{voter_id}/tags",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def add_tag_to_voter(
    request: Request,
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    body: VoterTagAssign,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Add a tag to a voter.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    await _service.add_tag_to_voter(db, voter_id, body.tag_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/campaigns/{campaign_id}/voters/{voter_id}/tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def remove_tag_from_voter(
    request: Request,
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    tag_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Remove a tag from a voter.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    await _service.remove_tag_from_voter(db, voter_id, tag_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/campaigns/{campaign_id}/voters/{voter_id}/tags",
    response_model=list[VoterTagResponse],
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def get_voter_tags(
    request: Request,
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Get all tags for a specific voter.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    tags = await _service.get_voter_tags(db, voter_id)
    return [VoterTagResponse.model_validate(t) for t in tags]
