"""Organization-level API endpoints.

These endpoints bypass campaign RLS and use get_db() directly (D-13).
All endpoints gated by require_org_role("org_admin") minimum (D-10),
except PATCH /org which requires org_owner (D-14).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    AuthenticatedUser,
    require_org_role,
)
from app.db.session import get_db
from app.models.organization import Organization
from app.schemas.org import (
    AddMemberToCampaignRequest,
    CampaignRoleEntry,
    OrgCampaignResponse,
    OrgMemberResponse,
    OrgResponse,
    OrgUpdate,
)
from app.services.org import OrgService

router = APIRouter()
_service = OrgService()


@router.get("", response_model=OrgResponse)
async def get_org(
    user: AuthenticatedUser = Depends(
        require_org_role("org_admin")
    ),
    db: AsyncSession = Depends(get_db),
):
    """Get organization details for the authenticated user's org."""
    org = await db.scalar(
        select(Organization).where(
            Organization.zitadel_org_id == user.org_id
        )
    )
    return OrgResponse.model_validate(org)


@router.patch("", response_model=OrgResponse)
async def update_org(
    body: OrgUpdate,
    user: AuthenticatedUser = Depends(
        require_org_role("org_owner")
    ),
    db: AsyncSession = Depends(get_db),
):
    """Update organization details. Requires org_owner role."""
    org = await db.scalar(
        select(Organization).where(
            Organization.zitadel_org_id == user.org_id
        )
    )
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    if body.name is not None:
        org.name = body.name
    await db.commit()
    await db.refresh(org)
    return OrgResponse.model_validate(org)


@router.get(
    "/campaigns", response_model=list[OrgCampaignResponse]
)
async def list_org_campaigns(
    user: AuthenticatedUser = Depends(
        require_org_role("org_admin")
    ),
    db: AsyncSession = Depends(get_db),
):
    """List all campaigns in the user's organization."""
    org = await db.scalar(
        select(Organization).where(
            Organization.zitadel_org_id == user.org_id
        )
    )
    results = await _service.list_campaigns(db, org.id)
    return [
        OrgCampaignResponse(
            id=r["campaign"].id,
            name=r["campaign"].name,
            slug=getattr(r["campaign"], "slug", None),
            campaign_type=getattr(
                r["campaign"], "campaign_type", None
            ),
            election_date=getattr(
                r["campaign"], "election_date", None
            ),
            created_at=r["campaign"].created_at,
            member_count=r["member_count"],
            status=getattr(r["campaign"], "status", None),
        )
        for r in results
    ]


@router.get(
    "/members", response_model=list[OrgMemberResponse]
)
async def list_org_members(
    user: AuthenticatedUser = Depends(
        require_org_role("org_admin")
    ),
    db: AsyncSession = Depends(get_db),
):
    """List all org-level members with their roles."""
    org = await db.scalar(
        select(Organization).where(
            Organization.zitadel_org_id == user.org_id
        )
    )
    results = (
        await _service.list_members_with_campaign_roles(
            db, org.id
        )
    )
    return [
        OrgMemberResponse(
            user_id=r["member"].user_id,
            display_name=getattr(
                r["user"], "display_name", None
            ),
            email=getattr(r["user"], "email", None),
            role=r["member"].role,
            joined_at=r["member"].joined_at,
            created_at=r["member"].created_at,
            campaign_roles=[
                CampaignRoleEntry(**cr)
                for cr in r.get("campaign_roles", [])
            ],
        )
        for r in results
    ]


@router.post(
    "/campaigns/{campaign_id}/members",
    status_code=status.HTTP_201_CREATED,
)
async def add_member_to_campaign(
    campaign_id: uuid.UUID,
    body: AddMemberToCampaignRequest,
    user: AuthenticatedUser = Depends(
        require_org_role("org_admin")
    ),
    db: AsyncSession = Depends(get_db),
):
    """Add an existing org member to a campaign."""
    org = await db.scalar(
        select(Organization).where(
            Organization.zitadel_org_id == user.org_id
        )
    )
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    try:
        cm = await _service.add_member_to_campaign(
            db,
            org.id,
            campaign_id,
            body.user_id,
            body.role,
        )
        return {
            "id": str(cm.id),
            "user_id": cm.user_id,
            "campaign_id": str(cm.campaign_id),
            "role": cm.role,
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
