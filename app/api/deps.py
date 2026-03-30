"""Shared FastAPI dependencies: DB with RLS, user sync, campaign context."""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

from fastapi import HTTPException
from loguru import logger
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import CampaignNotFoundError
from app.core.security import AuthenticatedUser
from app.core.time import utcnow
from app.db.rls import set_campaign_context
from app.db.session import async_session_factory
from app.models.campaign import Campaign
from app.models.campaign_member import CampaignMember
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.user import User

# Map JWT role names to OrganizationMember role values
_JWT_ROLE_TO_ORG_ROLE: dict[str, str] = {
    "owner": "org_owner",
    "admin": "org_admin",
    "manager": "org_admin",
}


async def get_campaign_db(
    campaign_id: uuid.UUID,
) -> AsyncGenerator[AsyncSession]:
    """DB session with RLS context auto-set from URL path parameter.

    All campaign-scoped routes MUST use this instead of get_db().
    campaign_id is extracted automatically by FastAPI from the URL path.
    Per D-04: centralizes RLS so no endpoint can skip it.
    Per D-05: only routes with campaign_id in path get RLS context.

    Args:
        campaign_id: The campaign UUID from the URL path parameter.

    Yields:
        AsyncSession with campaign context configured.

    Raises:
        HTTPException: 403 if campaign_id is invalid/empty.
    """
    async with async_session_factory() as session:
        try:
            await set_campaign_context(session, str(campaign_id))
        except ValueError as exc:
            raise HTTPException(
                status_code=403,
                detail="Campaign context required",
            ) from exc
        yield session


# DEPRECATED: use get_campaign_db instead. Remove after Phase 39 migration complete.
async def get_db_with_rls(
    campaign_id: str,
) -> AsyncGenerator[AsyncSession]:
    """Get a DB session with RLS campaign context set.

    .. deprecated::
        Use :func:`get_campaign_db` instead.

    Args:
        campaign_id: The campaign UUID to scope RLS queries.

    Yields:
        AsyncSession with campaign context configured.
    """
    async with async_session_factory() as session:
        await set_campaign_context(session, campaign_id)
        yield session


async def ensure_user_synced(
    user: AuthenticatedUser,
    db: AsyncSession,
) -> User:
    """Create or update local User record from JWT claims.

    Also ensures CampaignMember record exists (belt-and-suspenders).

    Args:
        user: The authenticated user from JWT.
        db: The async database session.

    Returns:
        The local User record.
    """
    result = await db.execute(select(User).where(User.id == user.id))
    local_user = result.scalar_one_or_none()

    if local_user is None:
        now = utcnow()
        local_user = User(
            id=user.id,
            display_name=user.display_name or "",
            email=user.email or "",
            created_at=now,
            updated_at=now,
        )
        db.add(local_user)
        await db.commit()
        logger.info("Created local user record for {}", user.id)
    else:
        # Update display_name and email if changed
        changed = False
        if user.display_name and (
            local_user.display_name != user.display_name
            or not local_user.display_name.strip()
        ):
            local_user.display_name = user.display_name
            changed = True
        if user.email and local_user.email != user.email:
            local_user.email = user.email
            changed = True
        if changed:
            await db.commit()

    # Belt-and-suspenders: ensure organization_member + campaign_member exist.
    # Use all org IDs from JWT role claims (multi-tenant support).
    user_org_ids = user.org_ids if user.org_ids else [user.org_id]

    orgs_result = await db.execute(
        select(Organization).where(Organization.zitadel_org_id.in_(user_org_ids))
    )
    orgs = orgs_result.scalars().all()

    # Determine the best org role from JWT claims
    jwt_role_name = user.role.name.lower() if user.role else "viewer"
    org_role = _JWT_ROLE_TO_ORG_ROLE.get(jwt_role_name)

    # Ensure OrganizationMember records exist
    for org in orgs:
        existing_member = await db.scalar(
            select(OrganizationMember).where(
                OrganizationMember.user_id == user.id,
                OrganizationMember.organization_id == org.id,
            )
        )
        if existing_member is None and org_role:
            db.add(
                OrganizationMember(
                    user_id=user.id,
                    organization_id=org.id,
                    role=org_role,
                )
            )
            logger.info(
                "Created organization_member for user {} in org {} (role={})",
                user.id,
                org.id,
                org_role,
            )

    # Ensure CampaignMember records exist for all org campaigns
    campaigns: list[Campaign] = []
    for org in orgs:
        campaign_result = await db.execute(
            select(Campaign).where(Campaign.organization_id == org.id)
        )
        campaigns.extend(campaign_result.scalars().all())

    if not campaigns:
        # Fallback: direct lookup by any of the user's org IDs
        campaign_result = await db.execute(
            select(Campaign).where(Campaign.zitadel_org_id.in_(user_org_ids))
        )
        campaigns = list(campaign_result.scalars().all())

    for campaign in campaigns:
        member_result = await db.execute(
            select(CampaignMember).where(
                CampaignMember.user_id == user.id,
                CampaignMember.campaign_id == campaign.id,
            )
        )
        existing_campaign_member = member_result.scalar_one_or_none()
        if existing_campaign_member is None:
            member = CampaignMember(
                user_id=user.id,
                campaign_id=campaign.id,
                role=jwt_role_name,
            )
            db.add(member)
            logger.info(
                "Created campaign_member for user {} in campaign {} (role={})",
                user.id,
                campaign.id,
                jwt_role_name,
            )
        elif existing_campaign_member.role is None:
            # Backfill: existing members without a role get the JWT claim role
            existing_campaign_member.role = jwt_role_name
            logger.info(
                "Backfilled campaign_member role for user {} in campaign {} (role={})",
                user.id,
                campaign.id,
                jwt_role_name,
            )

    if orgs or campaigns:
        try:
            await db.commit()
        except IntegrityError:
            # Race condition: another concurrent request already inserted
            # the same org_member or campaign_member row. Safe to ignore.
            await db.rollback()
            logger.debug(
                "IntegrityError in ensure_user_synced for user {} "
                "(concurrent insert race condition, safe to ignore)",
                user.id,
            )

    return local_user


# DEPRECATED: Use get_campaign_db for campaign-scoped endpoints.
# Retained for campaign list page only (D-08).
async def get_campaign_from_token(
    user: AuthenticatedUser,
    db: AsyncSession,
) -> Campaign:
    """Look up a default campaign for the user's org.

    DEPRECATED for campaign-scoped endpoints -- use get_campaign_db instead.
    This function is retained ONLY as a fallback for the campaign list page
    where no campaign_id is in the URL path. Per D-08.

    Campaign-scoped endpoints MUST use get_campaign_db (Plan 02)
    which extracts campaign_id from the URL path parameter.

    Args:
        user: The authenticated user.
        db: The async database session.

    Returns:
        The Campaign matching the user's org.

    Raises:
        CampaignNotFoundError: If no campaign matches the org_id.
    """
    # Try Organization path first, fall back to direct Campaign lookup
    user_org_ids = user.org_ids if user.org_ids else [user.org_id]
    org_result = await db.execute(
        select(Organization).where(Organization.zitadel_org_id.in_(user_org_ids))
    )
    org = org_result.scalars().first()

    if org:
        result = await db.execute(
            select(Campaign)
            .where(Campaign.organization_id == org.id)
            .order_by(Campaign.created_at.desc())
        )
    else:
        result = await db.execute(
            select(Campaign).where(Campaign.zitadel_org_id.in_(user_org_ids))
        )

    campaign = result.scalars().first()
    if campaign is None:
        raise CampaignNotFoundError(uuid.UUID("00000000-0000-0000-0000-000000000000"))
    return campaign
