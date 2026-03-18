"""Campaign business logic with compensating transactions."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import CampaignNotFoundError, InsufficientPermissionsError
from app.core.security import CampaignRole
from app.core.time import utcnow
from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.models.campaign_member import CampaignMember
from app.models.organization import Organization
from app.schemas.common import PaginationResponse

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
        jurisdiction_fips: str | None = None,
        jurisdiction_name: str | None = None,
        election_date=None,
        candidate_name: str | None = None,
        party_affiliation: str | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> Campaign:
        """Create a campaign with ZITADEL org provisioning.

        Implements compensating transaction pattern: if local DB write fails
        and a new ZITADEL org was created, it is deleted to maintain consistency.
        When reusing an existing organization, the compensating delete is skipped.

        Args:
            db: Async database session.
            name: Campaign name.
            campaign_type: Type of campaign (federal, state, local, ballot).
            user: The authenticated user creating the campaign.
            zitadel: ZITADEL service client for org provisioning.
            jurisdiction_fips: Optional FIPS code.
            jurisdiction_name: Optional jurisdiction name.
            election_date: Optional election date.
            candidate_name: Optional candidate name.
            party_affiliation: Optional party affiliation.
            organization_id: Optional existing Organization UUID to associate.
                When provided, reuses the existing ZITADEL org instead of
                creating a new one.

        Returns:
            The created Campaign object.

        Raises:
            CampaignNotFoundError: If organization_id is provided but not found.
            ZitadelUnavailableError: If ZITADEL is unreachable.
            Exception: If DB write fails (after ZITADEL org cleanup for new orgs).
        """
        # Track whether we provisioned a new ZITADEL org so the compensating
        # transaction only deletes what we created.
        created_new_org = organization_id is None

        # Step 1: Resolve ZITADEL org — reuse existing or create new
        if organization_id:
            # Reuse an existing Organization record
            org_result = await db.execute(
                select(Organization).where(Organization.id == organization_id)
            )
            org = org_result.scalar_one_or_none()
            if org is None:
                raise CampaignNotFoundError(organization_id)
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
        else:
            # Create a new ZITADEL org for this campaign
            org_data = await zitadel.create_organization(name)
            org_id = org_data["id"]

            # Ensure a project grant so the new org's users can receive roles
            # scoped to the shared project. This call is idempotent.
            project_grant_id = await zitadel.ensure_project_grant(
                settings.zitadel_project_id, org_id, ALL_ROLES
            )

        try:
            # Step 2: Create the local Organization record when provisioning a new org
            if not organization_id:
                org_record = Organization(
                    id=uuid.uuid4(),
                    zitadel_org_id=org_id,
                    zitadel_project_grant_id=project_grant_id,
                    name=name,
                    created_by=user.id,
                )
                db.add(org_record)
                await db.flush()
                organization_id = org_record.id

            # Step 3: Create local campaign record
            campaign = Campaign(
                id=uuid.uuid4(),
                zitadel_org_id=org_id,
                organization_id=organization_id,
                name=name,
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

            # Step 4: Create campaign_member for the creator with owner role
            member = CampaignMember(
                user_id=user.id,
                campaign_id=campaign.id,
                role="owner",
            )
            db.add(member)

            # Step 5: Assign owner role in ZITADEL, scoped to the campaign's org
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

        except Exception:
            logger.warning(
                "Local DB write failed for campaign '{}', rolling back (org={})",
                name,
                org_id,
            )
            await db.rollback()
            if created_new_org:
                # Compensating transaction: remove the ZITADEL org we just created
                try:
                    await zitadel.delete_organization(org_id)
                except Exception:
                    logger.error(
                        "Failed to clean up ZITADEL org {} during compensating tx",
                        org_id,
                    )
            raise

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

        await zitadel.deactivate_organization(campaign.zitadel_org_id)
        await db.commit()


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
