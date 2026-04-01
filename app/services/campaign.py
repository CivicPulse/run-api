"""Campaign business logic with compensating transactions."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import httpx
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import (
    CampaignNotFoundError,
    InsufficientPermissionsError,
    OrganizationNotFoundError,
)
from app.core.security import CampaignRole
from app.core.time import utcnow
from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.models.campaign_member import CampaignMember
from app.models.organization import Organization
from app.schemas.common import PaginationResponse
from app.utils.slug import generate_slug

if TYPE_CHECKING:
    from app.core.security import AuthenticatedUser
    from app.services.zitadel import ZitadelService

# All available campaign roles, lowercase, ordered by CampaignRole enum definition.
ALL_ROLES: list[str] = [r.name.lower() for r in CampaignRole]


class CampaignService:
    """Campaign CRUD operations with ZITADEL org lifecycle management."""

    async def create_campaign(
        self,
        db: AsyncSession,
        name: str,
        campaign_type: CampaignType,
        user: AuthenticatedUser,
        zitadel: ZitadelService,
        organization_id: uuid.UUID,
        jurisdiction_fips: str | None = None,
        jurisdiction_name: str | None = None,
        election_date=None,
        candidate_name: str | None = None,
        party_affiliation: str | None = None,
    ) -> Campaign:
        """Create a campaign within an existing organization.

        Args:
            db: Async database session.
            name: Campaign name.
            campaign_type: Type of campaign (federal, state, local, ballot).
            user: The authenticated user creating the campaign.
            zitadel: ZITADEL service client for grant and role management.
            jurisdiction_fips: Optional FIPS code.
            jurisdiction_name: Optional jurisdiction name.
            election_date: Optional election date.
            candidate_name: Optional candidate name.
            party_affiliation: Optional party affiliation.
            organization_id: Existing Organization UUID to associate.

        Returns:
            The created Campaign object.

        Raises:
            OrganizationNotFoundError: If organization_id is not found.
            ZitadelUnavailableError: If ZITADEL is unreachable.
            Exception: If DB write fails.
        """
        org_result = await db.execute(
            select(Organization).where(Organization.id == organization_id)
        )
        org = org_result.scalar_one_or_none()
        if org is None:
            raise OrganizationNotFoundError(organization_id)
        org_id = org.zitadel_org_id
        project_grant_id = (
            org.zitadel_project_grant_id
            or await zitadel.ensure_project_grant(
                settings.zitadel_project_id, org_id, ALL_ROLES
            )
        )
        # Persist the grant ID if it was missing so future lookups are fast
        if not org.zitadel_project_grant_id:
            org.zitadel_project_grant_id = project_grant_id

        try:
            # Step 2: Create local campaign record
            campaign_slug = await self._generate_unique_slug(db, name)

            campaign = Campaign(
                id=uuid.uuid4(),
                zitadel_org_id=org_id,
                organization_id=organization_id,
                name=name,
                slug=campaign_slug,
                type=campaign_type,
                jurisdiction_fips=jurisdiction_fips,
                jurisdiction_name=jurisdiction_name,
                election_date=election_date,
                candidate_name=candidate_name,
                party_affiliation=party_affiliation,
                status=CampaignStatus.ACTIVE,
                created_by=user.id,
            )
            db.add(campaign)

            # Step 3: Create campaign_member for the creator with owner role
            member = CampaignMember(
                user_id=user.id,
                campaign_id=campaign.id,
                role="owner",
            )
            db.add(member)

            # Step 4: Assign owner role in ZITADEL, scoped to the campaign's org
            await zitadel.assign_project_role(
                settings.zitadel_project_id,
                user.id,
                "owner",
                project_grant_id=project_grant_id,
                org_id=org_id,
            )

            await db.commit()
            await db.refresh(campaign)
            return campaign

        except IntegrityError as ie:
            # Slug collision from concurrent request — rollback and retry
            if "ix_campaigns_slug" in str(ie):
                logger.info("Slug collision for '{}', regenerating", campaign_slug)
                await db.rollback()
                # Retry the entire creation (recursive, but bounded by slug uniqueness)
                return await self.create_campaign(
                    db=db,
                    name=name,
                    campaign_type=campaign_type,
                    user=user,
                    zitadel=zitadel,
                    jurisdiction_fips=jurisdiction_fips,
                    jurisdiction_name=jurisdiction_name,
                    election_date=election_date,
                    candidate_name=candidate_name,
                    party_affiliation=party_affiliation,
                    organization_id=organization_id,
                )
            # Non-slug IntegrityError — re-raise so it's handled below
            raise
        except Exception:
            logger.warning(
                "Local DB write failed for campaign '{}', rolling back (org={})",
                name,
                org_id,
            )
            await db.rollback()
            try:
                await zitadel.remove_project_role(
                    settings.zitadel_project_id,
                    user.id,
                    "owner",
                    org_id=org_id,
                )
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    logger.debug("Grant not found (never created), skipping revocation")
                else:
                    logger.error(
                        "Failed to revoke owner grant for user {} in org {} "
                        "during compensating tx",
                        user.id,
                        org_id,
                    )
            except Exception:
                logger.error(
                    "Failed to revoke owner grant for user {} in org {} "
                    "during compensating tx",
                    user.id,
                    org_id,
                )
            raise

    @staticmethod
    async def _generate_unique_slug(db: AsyncSession, name: str) -> str:
        """Generate a unique slug, retrying with numeric suffixes on collision.

        Uses targeted EXISTS queries instead of loading all slugs into memory.
        """
        base = generate_slug(name)
        candidate = base
        counter = 2
        max_attempts = 100
        for _ in range(max_attempts):
            exists = await db.scalar(
                select(Campaign.id).where(Campaign.slug == candidate).limit(1)
            )
            if exists is None:
                return candidate
            candidate = f"{base}-{counter}"
            counter += 1
        msg = f"Could not generate unique slug for '{name}'"
        raise ValueError(msg)

    async def get_campaign(self, db: AsyncSession, campaign_id: uuid.UUID) -> Campaign:
        """Get a campaign by ID.

        Args:
            db: Async database session.
            campaign_id: The campaign UUID.

        Returns:
            The Campaign object.

        Raises:
            CampaignNotFoundError: If campaign does not exist.
        """
        result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
        campaign = result.scalar_one_or_none()
        if campaign is None:
            raise CampaignNotFoundError(campaign_id)
        return campaign

    async def list_campaigns(
        self,
        db: AsyncSession,
        limit: int = 20,
        cursor: str | None = None,
    ) -> tuple[list[Campaign], PaginationResponse]:
        """List campaigns with cursor-based pagination.

        Uses created_at + id for stable cursor ordering.

        Args:
            db: Async database session.
            limit: Maximum number of items to return.
            cursor: Opaque cursor string (created_at|id format).

        Returns:
            Tuple of (campaigns list, pagination metadata).
        """
        query = (
            select(Campaign)
            .where(Campaign.status != CampaignStatus.DELETED)
            .order_by(Campaign.created_at.desc(), Campaign.id.desc())
        )

        if cursor:
            parts = cursor.split("|", 1)
            if len(parts) == 2:
                cursor_ts = datetime.fromisoformat(parts[0])
                cursor_id = uuid.UUID(parts[1])
                query = query.where(
                    (Campaign.created_at < cursor_ts)
                    | ((Campaign.created_at == cursor_ts) & (Campaign.id < cursor_id))
                )

        # Fetch one extra to check has_more
        query = query.limit(limit + 1)

        result = await db.execute(query)
        items = list(result.scalars().all())

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        next_cursor = None
        if has_more and items:
            last = items[-1]
            next_cursor = f"{last.created_at.isoformat()}|{last.id}"

        pagination = PaginationResponse(
            next_cursor=next_cursor,
            has_more=has_more,
        )

        return items, pagination

    async def update_campaign(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        name: str | None = None,
        campaign_type: CampaignType | None = None,
        jurisdiction_fips: str | None = ...,
        jurisdiction_name: str | None = ...,
        election_date=...,
        candidate_name: str | None = ...,
        party_affiliation: str | None = ...,
        status: CampaignStatus | None = None,
    ) -> Campaign:
        """Update campaign fields.

        Args:
            db: Async database session.
            campaign_id: The campaign UUID.
            name: New name (if provided).
            campaign_type: New type (if provided).
            jurisdiction_fips: New FIPS code (ellipsis = not provided).
            jurisdiction_name: New jurisdiction name (ellipsis = not provided).
            election_date: New election date (ellipsis = not provided).
            candidate_name: New candidate name (ellipsis = not provided).
            party_affiliation: New party affiliation (ellipsis = not provided).
            status: New status (if provided, validates transitions).

        Returns:
            The updated Campaign object.

        Raises:
            CampaignNotFoundError: If campaign does not exist.
        """
        result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
        campaign = result.scalar_one_or_none()
        if campaign is None:
            raise CampaignNotFoundError(campaign_id)

        if name is not None:
            campaign.name = name
        if campaign_type is not None:
            campaign.type = campaign_type
        if jurisdiction_fips is not ...:
            campaign.jurisdiction_fips = jurisdiction_fips
        if jurisdiction_name is not ...:
            campaign.jurisdiction_name = jurisdiction_name
        if election_date is not ...:
            campaign.election_date = election_date
        if candidate_name is not ...:
            campaign.candidate_name = candidate_name
        if party_affiliation is not ...:
            campaign.party_affiliation = party_affiliation
        if status is not None:
            _validate_status_transition(campaign.status, status)
            campaign.status = status

        campaign.updated_at = utcnow()
        await db.commit()
        await db.refresh(campaign)
        return campaign

    async def delete_campaign(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        user: AuthenticatedUser,
        zitadel: ZitadelService,
    ) -> None:
        """Soft-delete a campaign and deactivate ZITADEL org.

        Only the campaign creator (owner) can delete.

        Args:
            db: Async database session.
            campaign_id: The campaign UUID.
            user: The authenticated user requesting deletion.
            zitadel: ZITADEL service client.

        Raises:
            CampaignNotFoundError: If campaign does not exist.
            InsufficientPermissionsError: If user is not the campaign creator.
            ZitadelUnavailableError: If ZITADEL is unreachable.
        """
        result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
        campaign = result.scalar_one_or_none()
        if campaign is None:
            raise CampaignNotFoundError(campaign_id)

        if campaign.created_by != user.id:
            raise InsufficientPermissionsError(
                "Only the campaign creator can delete a campaign"
            )

        campaign.status = CampaignStatus.DELETED
        campaign.updated_at = utcnow()

        # Check sibling count before commit to avoid race condition
        sibling_count = await db.scalar(
            select(func.count(Campaign.id)).where(
                Campaign.organization_id == campaign.organization_id,
                Campaign.id != campaign.id,
                Campaign.status != CampaignStatus.DELETED,
            )
        )

        await db.commit()

        # Best-effort ZITADEL org deactivation — the local soft-delete
        # is the source of truth, so we don't roll back if this fails.
        # Only deactivate ZITADEL org if no other active campaigns share it.
        if sibling_count == 0:
            try:
                await zitadel.deactivate_organization(campaign.zitadel_org_id)
            except Exception:
                logger.warning(
                    "Failed to deactivate ZITADEL org {} for campaign '{}', "
                    "local soft-delete succeeded",
                    campaign.zitadel_org_id,
                    campaign.name,
                )


def _validate_status_transition(
    current: CampaignStatus, target: CampaignStatus
) -> None:
    """Validate campaign status transitions.

    Allowed transitions:
        active -> suspended
        active -> archived
        suspended -> active

    Args:
        current: Current campaign status.
        target: Target campaign status.

    Raises:
        ValueError: If transition is not allowed.
    """
    valid_transitions: dict[CampaignStatus, set[CampaignStatus]] = {
        CampaignStatus.ACTIVE: {CampaignStatus.SUSPENDED, CampaignStatus.ARCHIVED},
        CampaignStatus.SUSPENDED: {CampaignStatus.ACTIVE},
    }

    allowed = valid_transitions.get(current, set())
    if target not in allowed:
        msg = f"Cannot transition from {current.value} to {target.value}"
        raise ValueError(msg)
