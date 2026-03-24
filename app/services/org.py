"""Organization service -- org-scoped queries (no RLS)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.campaign_member import CampaignMember
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.user import User


class OrgService:
    """Service for org-level data access.

    All queries filter by organization_id explicitly
    (D-17: no RLS on org data).
    """

    async def get_org(
        self, db: AsyncSession, org_id: uuid.UUID
    ) -> Organization | None:
        return await db.scalar(
            select(Organization).where(Organization.id == org_id)
        )

    async def list_campaigns(
        self, db: AsyncSession, org_id: uuid.UUID
    ) -> list[dict]:
        """List campaigns with member counts for an org."""
        member_count_sq = (
            select(
                CampaignMember.campaign_id,
                func.count().label("member_count"),
            )
            .group_by(CampaignMember.campaign_id)
            .subquery()
        )
        stmt = (
            select(
                Campaign,
                func.coalesce(
                    member_count_sq.c.member_count, 0
                ).label("member_count"),
            )
            .outerjoin(
                member_count_sq,
                Campaign.id == member_count_sq.c.campaign_id,
            )
            .where(Campaign.organization_id == org_id)
            .order_by(Campaign.created_at.desc())
        )
        results = await db.execute(stmt)
        return [
            {"campaign": row[0], "member_count": row[1]}
            for row in results.all()
        ]

    async def list_members(
        self, db: AsyncSession, org_id: uuid.UUID
    ) -> list[dict]:
        """List org-level members with user details."""
        stmt = (
            select(OrganizationMember, User)
            .join(User, OrganizationMember.user_id == User.id)
            .where(OrganizationMember.organization_id == org_id)
            .order_by(OrganizationMember.created_at.desc())
        )
        results = await db.execute(stmt)
        return [
            {"member": row[0], "user": row[1]}
            for row in results.all()
        ]
