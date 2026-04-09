"""Signup-link lifecycle and public-resolution business logic."""

from __future__ import annotations

import uuid

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.campaign import Campaign, CampaignStatus
from app.models.organization import Organization
from app.models.signup_link import SignupLink


class SignupLinkService:
    """Campaign-scoped signup-link CRUD and public resolution."""

    async def create_link(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        label: str,
        creator_id: str,
    ) -> SignupLink:
        link = SignupLink(
            campaign_id=campaign_id,
            label=label.strip(),
            created_by=creator_id,
        )
        db.add(link)
        await db.commit()
        await db.refresh(link)
        return link

    async def list_links(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
    ) -> list[SignupLink]:
        result = await db.execute(
            select(SignupLink)
            .where(SignupLink.campaign_id == campaign_id)
            .order_by(SignupLink.created_at.desc())
        )
        return list(result.scalars().all())

    async def disable_link(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        link_id: uuid.UUID,
    ) -> SignupLink | None:
        link = await db.scalar(
            select(SignupLink).where(
                SignupLink.id == link_id,
                SignupLink.campaign_id == campaign_id,
            )
        )
        if link is None:
            return None
        if link.status == "active":
            link.status = "disabled"
            link.disabled_at = utcnow()
            await db.commit()
            await db.refresh(link)
        return link

    async def regenerate_link(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        link_id: uuid.UUID,
        creator_id: str,
    ) -> SignupLink | None:
        link = await db.scalar(
            select(SignupLink).where(
                SignupLink.id == link_id,
                SignupLink.campaign_id == campaign_id,
            )
        )
        if link is None:
            return None
        if link.status != "active":
            raise ValueError("Only active signup links can be regenerated")

        link.status = "regenerated"
        link.regenerated_at = utcnow()

        replacement = SignupLink(
            campaign_id=campaign_id,
            label=link.label,
            created_by=creator_id,
        )
        db.add(replacement)
        await db.commit()
        await db.refresh(replacement)
        return replacement

    async def get_public_link(
        self,
        db: AsyncSession,
        token: uuid.UUID,
    ) -> tuple[SignupLink | None, Campaign | None, Organization | None]:
        link = await db.scalar(select(SignupLink).where(SignupLink.token == token))
        if link is None:
            return None, None, None
        if link.status != "active":
            return None, None, None
        if link.expires_at is not None and link.expires_at <= utcnow():
            return None, None, None

        campaign = await db.scalar(
            select(Campaign).where(
                and_(
                    Campaign.id == link.campaign_id,
                    Campaign.status == CampaignStatus.ACTIVE,
                )
            )
        )
        if campaign is None:
            return None, None, None

        organization = None
        if campaign.organization_id:
            organization = await db.scalar(
                select(Organization).where(Organization.id == campaign.organization_id)
            )

        return link, campaign, organization
