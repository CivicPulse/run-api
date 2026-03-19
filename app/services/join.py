"""Business logic for the volunteer self-registration (join) flow.

The join flow is intentionally separate from the general volunteer management
service because it operates without a campaign-scoped database RLS context and
needs to be accessible to users who have no pre-existing campaign role.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from loguru import logger
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import CampaignNotFoundError
from app.models.campaign import Campaign, CampaignStatus
from app.models.campaign_member import CampaignMember
from app.models.organization import Organization
from app.models.volunteer import Volunteer
from app.services.campaign import ALL_ROLES

if TYPE_CHECKING:
    from app.core.security import AuthenticatedUser
    from app.services.zitadel import ZitadelService


class JoinService:
    """Service layer for the public volunteer join flow.

    All methods use the provided ``AsyncSession`` directly and leave commit
    control to the calling API layer (except for ``register_volunteer``, which
    commits internally to keep the atomic unit cohesive).
    """

    async def get_campaign_public_info(self, slug: str, db: AsyncSession) -> Campaign:
        """Look up an active campaign by its URL slug.

        Args:
            slug: The URL-safe campaign slug from the join link.
            db: Async SQLAlchemy session.

        Returns:
            The matching active ``Campaign`` ORM object.

        Raises:
            CampaignNotFoundError: If no active campaign exists for the slug.
        """
        result = await db.execute(
            select(Campaign).where(
                Campaign.slug == slug,
                Campaign.status == CampaignStatus.ACTIVE,
            )
        )
        campaign = result.scalar_one_or_none()
        if campaign is None:
            logger.info("Join lookup: no active campaign found for slug='{}'", slug)
            # CampaignNotFoundError expects a UUID; use a sentinel value because
            # we only have a slug here.  The API layer converts this to a 404.
            raise CampaignNotFoundError(uuid.UUID(int=0))
        return campaign

    async def register_volunteer(
        self,
        slug: str,
        user: AuthenticatedUser,
        db: AsyncSession,
        zitadel: ZitadelService,
    ) -> dict:
        """Atomically register an authenticated user as a volunteer for a campaign.

        Steps:
        1. Look up the campaign by slug (raises ``CampaignNotFoundError`` if
           inactive or not found).
        2. Check for an existing ``CampaignMember`` row (raises ``ValueError``
           with ``"already_registered:<campaign_id>"`` if the user is already a
           member of this campaign).
        3. Create a ``CampaignMember`` row with ``role="volunteer"``.
        4. Create a ``Volunteer`` profile record from the user's JWT claims.
        5. Assign the ``volunteer`` ZITADEL project role scoped to the campaign
           organisation.
        6. Commit and return summary ids.

        Args:
            slug: The URL-safe campaign slug.
            user: The authenticated user performing the registration.
            db: Async SQLAlchemy session.
            zitadel: Injected ZITADEL service client.

        Returns:
            A dict with keys ``campaign_id`` (str), ``campaign_slug`` (str),
            and ``volunteer_id`` (str).

        Raises:
            CampaignNotFoundError: If slug resolves to no active campaign.
            ValueError: ``"already_registered:<campaign_id>"`` if the user is
                already registered to the campaign.
        """
        # Step 1 — resolve campaign
        campaign = await self.get_campaign_public_info(slug, db)

        # Step 2 — duplicate check
        existing_member = await db.scalar(
            select(CampaignMember).where(
                CampaignMember.user_id == user.id,
                CampaignMember.campaign_id == campaign.id,
            )
        )
        if existing_member is not None:
            logger.info(
                "User {} already registered for campaign {}", user.id, campaign.id
            )
            raise ValueError(f"already_registered:{campaign.id}")

        # Step 3 — create campaign membership
        member = CampaignMember(
            user_id=user.id,
            campaign_id=campaign.id,
            role="volunteer",
        )
        db.add(member)

        # Step 3b — flush to surface uniqueness constraint before ZITADEL calls.
        # Prevents concurrent registrations from both passing the app-level
        # check above and then racing through external role assignment.
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            raise ValueError(f"already_registered:{campaign.id}") from None

        # Step 4 — create volunteer profile from JWT claims
        name_parts = (user.display_name or "").split(" ", 1)
        first_name = name_parts[0] if name_parts else ""
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        volunteer = Volunteer(
            id=uuid.uuid4(),
            campaign_id=campaign.id,
            user_id=user.id,
            first_name=first_name,
            last_name=last_name,
            email=user.email,
            status="active",
            skills=[],
            created_by=user.id,
        )
        db.add(volunteer)

        # Step 5 — assign ZITADEL project role
        #   Resolve the project grant ID from the Organization record so the
        #   role is scoped to the campaign's ZITADEL org.
        project_grant_id: str | None = None
        if campaign.organization_id:
            org = await db.scalar(
                select(Organization).where(Organization.id == campaign.organization_id)
            )
            if org:
                project_grant_id = org.zitadel_project_grant_id

        if not project_grant_id and campaign.zitadel_org_id:
            # Organization row missing or not yet backfilled — try to resolve
            # the grant ID on the fly so the role is properly scoped.
            project_grant_id = await zitadel.ensure_project_grant(
                settings.zitadel_project_id,
                campaign.zitadel_org_id,
                ALL_ROLES,
            )
            logger.warning(
                "project_grant_id resolved via ensure_project_grant for campaign {}",
                campaign.id,
            )

        # ZITADEL role assignment happens BEFORE commit.
        # If ZITADEL fails, the exception propagates and the DB transaction
        # rolls back.  If the DB commit fails after ZITADEL succeeds, we
        # attempt to remove the orphaned role (compensating transaction).
        await zitadel.assign_project_role(
            settings.zitadel_project_id,
            user.id,
            "volunteer",
            project_grant_id=project_grant_id,
            org_id=campaign.zitadel_org_id,
        )

        # Step 6 — commit (with compensating rollback on failure)
        try:
            await db.commit()
        except Exception as commit_exc:
            logger.error(
                "DB commit failed for user {} registering to campaign {}: {}",
                user.id,
                campaign.id,
                commit_exc,
            )
            try:
                await zitadel.remove_project_role(
                    settings.zitadel_project_id,
                    user.id,
                    "volunteer",
                    org_id=campaign.zitadel_org_id,
                )
            except Exception as cleanup_exc:
                logger.error(
                    "Failed to remove orphaned ZITADEL role for user {} "
                    "after DB commit failure: {}",
                    user.id,
                    cleanup_exc,
                )
            raise
        await db.refresh(volunteer)

        logger.info(
            "Volunteer {} registered for campaign '{}' (id={})",
            user.id,
            campaign.slug,
            campaign.id,
        )

        return {
            "campaign_id": str(campaign.id),
            "campaign_slug": campaign.slug,
            "volunteer_id": str(volunteer.id),
        }
