"""/me and /me/campaigns endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, get_current_user
from app.db.session import get_db
from app.models.campaign import Campaign
from app.models.campaign_member import CampaignMember
from app.schemas.user import UserCampaignResponse, UserResponse

router = APIRouter()


@router.get(
    "",
    response_model=UserResponse,
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def get_me(
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current user info from local DB."""
    local_user = await ensure_user_synced(user, db)
    return UserResponse.model_validate(local_user)


@router.get(
    "/campaigns",
    response_model=list[UserCampaignResponse],
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def get_my_campaigns(
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all campaigns the current user belongs to."""
    await ensure_user_synced(user, db)

    result = await db.execute(
        select(
            CampaignMember.campaign_id,
            Campaign.name,
            CampaignMember.role,
        )
        .join(Campaign, CampaignMember.campaign_id == Campaign.id)
        .where(CampaignMember.user_id == user.id)
    )
    rows = result.all()

    return [
        UserCampaignResponse(
            campaign_id=str(row.campaign_id),
            campaign_name=row.name,
            role=row.role
            if row.role
            else (user.role.name.lower() if user.role else "viewer"),
        )
        for row in rows
    ]
