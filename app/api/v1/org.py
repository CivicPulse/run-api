"""Organization-level API endpoints.

These endpoints bypass campaign RLS and use get_db() directly (D-13).
All endpoints gated by require_org_role("org_admin") minimum (D-10).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser, require_org_role
from app.db.session import get_db
from app.models.organization import Organization
from app.schemas.org import (
    OrgCampaignResponse,
    OrgMemberResponse,
    OrgResponse,
)
from app.services.org import OrgService

router = APIRouter()
_service = OrgService()


@router.get("", response_model=OrgResponse)
async def get_org(
    user: AuthenticatedUser = Depends(require_org_role("org_admin")),
    db: AsyncSession = Depends(get_db),
):
    """Get organization details for the authenticated user's org."""
    org = await db.scalar(
        select(Organization).where(
            Organization.zitadel_org_id == user.org_id
        )
    )
    return OrgResponse.model_validate(org)


@router.get(
    "/campaigns", response_model=list[OrgCampaignResponse]
)
async def list_org_campaigns(
    user: AuthenticatedUser = Depends(require_org_role("org_admin")),
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
        )
        for r in results
    ]


@router.get("/members", response_model=list[OrgMemberResponse])
async def list_org_members(
    user: AuthenticatedUser = Depends(require_org_role("org_admin")),
    db: AsyncSession = Depends(get_db),
):
    """List all org-level members with their roles."""
    org = await db.scalar(
        select(Organization).where(
            Organization.zitadel_org_id == user.org_id
        )
    )
    results = await _service.list_members(db, org.id)
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
        )
        for r in results
    ]
