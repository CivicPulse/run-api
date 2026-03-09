"""Shared FastAPI dependencies: DB with RLS, user sync, campaign context."""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.db.rls import set_campaign_context
from app.db.session import async_session_factory
from app.models.campaign import Campaign
from app.models.campaign_member import CampaignMember
from app.models.user import User


async def get_db_with_rls(
    campaign_id: str,
) -> AsyncGenerator[AsyncSession]:
    """Get a DB session with RLS campaign context set.

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
        now = datetime.now(UTC)
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
        if user.display_name and local_user.display_name != user.display_name:
            local_user.display_name = user.display_name
            changed = True
        if user.email and local_user.email != user.email:
            local_user.email = user.email
            changed = True
        if changed:
            await db.commit()

    # Belt-and-suspenders: ensure campaign_member exists
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.zitadel_org_id == user.org_id)
    )
    campaign = campaign_result.scalar_one_or_none()
    if campaign:
        member_result = await db.execute(
            select(CampaignMember).where(
                CampaignMember.user_id == user.id,
                CampaignMember.campaign_id == campaign.id,
            )
        )
        if member_result.scalar_one_or_none() is None:
            member = CampaignMember(
                user_id=user.id,
                campaign_id=campaign.id,
            )
            db.add(member)
            await db.commit()
            logger.info(
                "Created campaign_member for user {} in campaign {}",
                user.id,
                campaign.id,
            )

    return local_user


async def get_campaign_from_token(
    user: AuthenticatedUser,
    db: AsyncSession,
) -> Campaign:
    """Look up campaign by user's ZITADEL org_id.

    Args:
        user: The authenticated user.
        db: The async database session.

    Returns:
        The Campaign matching the user's org.

    Raises:
        CampaignNotFoundError: If no campaign matches the org_id.
    """
    from app.core.errors import CampaignNotFoundError

    result = await db.execute(
        select(Campaign).where(Campaign.zitadel_org_id == user.org_id)
    )
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise CampaignNotFoundError(
            uuid.UUID("00000000-0000-0000-0000-000000000000")
        )
    return campaign
