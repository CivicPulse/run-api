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

    async def list_members_with_campaign_roles(
        self, db: AsyncSession, org_id: uuid.UUID
    ) -> list[dict]:
        """List org members with their per-campaign roles."""
        # First get org members with user details
        members = await self.list_members(db, org_id)
        # Get all campaigns in this org
        campaigns = await db.execute(
            select(Campaign.id, Campaign.name).where(
                Campaign.organization_id == org_id
            )
        )
        campaign_list = campaigns.all()
        # For each member, find their campaign memberships
        for member_dict in members:
            user_id = member_dict["member"].user_id
            cm_stmt = select(
                CampaignMember.campaign_id, CampaignMember.role
            ).where(
                CampaignMember.user_id == user_id,
                CampaignMember.campaign_id.in_(
                    [c.id for c in campaign_list]
                ),
            )
            cm_results = await db.execute(cm_stmt)
            campaign_roles = []
            for cm in cm_results.all():
                campaign_name = next(
                    (
                        c.name
                        for c in campaign_list
                        if c.id == cm.campaign_id
                    ),
                    "",
                )
                campaign_roles.append(
                    {
                        "campaign_id": cm.campaign_id,
                        "campaign_name": campaign_name,
                        "role": cm.role or "viewer",
                    }
                )
            member_dict["campaign_roles"] = campaign_roles
        return members

    async def add_member_to_campaign(
        self,
        db: AsyncSession,
        org_id: uuid.UUID,
        campaign_id: uuid.UUID,
        user_id: str,
        role: str,
    ) -> CampaignMember:
        """Add an existing org member to a campaign."""
        # Verify campaign belongs to org
        campaign = await db.scalar(
            select(Campaign).where(
                Campaign.id == campaign_id,
                Campaign.organization_id == org_id,
            )
        )
        if not campaign:
            raise ValueError(
                "Campaign not found in this organization"
            )
        # Verify user is an org member
        org_member = await db.scalar(
            select(OrganizationMember).where(
                OrganizationMember.user_id == user_id,
                OrganizationMember.organization_id == org_id,
            )
        )
        if not org_member:
            raise ValueError(
                "User is not a member of this organization"
            )
        # Check for existing campaign membership
        existing = await db.scalar(
            select(CampaignMember).where(
                CampaignMember.user_id == user_id,
                CampaignMember.campaign_id == campaign_id,
            )
        )
        if existing:
            raise ValueError(
                "User is already a member of this campaign"
            )
        cm = CampaignMember(
            user_id=user_id,
            campaign_id=campaign_id,
            role=role,
        )
        db.add(cm)
        await db.commit()
        await db.refresh(cm)
        return cm
