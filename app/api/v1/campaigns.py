"""Campaign CRUD endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, get_current_user, require_role
from app.db.session import get_db
from app.schemas.campaign import CampaignCreate, CampaignResponse, CampaignUpdate
from app.schemas.common import PaginatedResponse
from app.services.campaign import CampaignService

router = APIRouter()

_service = CampaignService()


@router.post(
    "",
    response_model=CampaignResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def create_campaign(
    body: CampaignCreate,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new campaign in an existing organization.

    Any authenticated user can create a campaign in their current organization
    (they become owner). Campaign creation must use an existing org and never
    provisions a new organization.
    """
    await ensure_user_synced(user, db)

    from app.models.organization import Organization

    user_org_ids = user.org_ids if user.org_ids else [user.org_id]
    organization = await db.scalar(
        select(Organization).where(
            Organization.id == body.organization_id,
            Organization.zitadel_org_id.in_(user_org_ids),
        )
    )
    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Selected organization is not available",
        )

    zitadel = request.app.state.zitadel_service
    campaign = await _service.create_campaign(
        db=db,
        name=body.name,
        campaign_type=body.type,
        user=user,
        zitadel=zitadel,
        jurisdiction_fips=body.jurisdiction_fips,
        jurisdiction_name=body.jurisdiction_name,
        election_date=body.election_date,
        candidate_name=body.candidate_name,
        party_affiliation=body.party_affiliation,
        organization_id=organization.id,
    )
    return CampaignResponse.model_validate(campaign)


@router.get(
    "",
    response_model=PaginatedResponse[CampaignResponse],
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def list_campaigns(
    request: Request,
    limit: int = 20,
    cursor: str | None = None,
    user: AuthenticatedUser = Depends(require_role("viewer")),
    db: AsyncSession = Depends(get_db),
):
    """List campaigns with cursor-based pagination.

    Requires viewer+ role.
    """
    await ensure_user_synced(user, db)
    items, pagination = await _service.list_campaigns(
        db=db, user=user, limit=limit, cursor=cursor
    )
    return PaginatedResponse[CampaignResponse](
        items=[CampaignResponse.model_validate(c) for c in items],
        pagination=pagination,
    )


@router.get(
    "/{campaign_id}",
    response_model=CampaignResponse,
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def get_campaign(
    request: Request,
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("viewer")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single campaign by ID.

    Requires viewer+ role.
    """
    await ensure_user_synced(user, db)
    campaign = await _service.get_campaign(db, campaign_id)
    return CampaignResponse.model_validate(campaign)


@router.patch(
    "/{campaign_id}",
    response_model=CampaignResponse,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def update_campaign(
    request: Request,
    campaign_id: uuid.UUID,
    body: CampaignUpdate,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Update a campaign.

    Requires admin+ role.
    """
    await ensure_user_synced(user, db)

    update_kwargs: dict = {}
    if body.name is not None:
        update_kwargs["name"] = body.name
    if body.type is not None:
        update_kwargs["campaign_type"] = body.type
    if body.status is not None:
        update_kwargs["status"] = body.status

    # Handle nullable fields explicitly (None is a valid value for clearing)
    data = body.model_dump(exclude_unset=True)
    for field in (
        "jurisdiction_fips",
        "jurisdiction_name",
        "election_date",
        "candidate_name",
        "party_affiliation",
    ):
        if field in data:
            update_kwargs[field] = data[field]

    try:
        campaign = await _service.update_campaign(
            db=db,
            campaign_id=campaign_id,
            **update_kwargs,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return CampaignResponse.model_validate(campaign)


@router.delete(
    "/{campaign_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def delete_campaign(
    campaign_id: uuid.UUID,
    request: Request,
    user: AuthenticatedUser = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a campaign and deactivate ZITADEL org.

    Requires owner role.
    """
    await ensure_user_synced(user, db)
    zitadel = request.app.state.zitadel_service
    await _service.delete_campaign(
        db=db,
        campaign_id=campaign_id,
        user=user,
        zitadel=zitadel,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
