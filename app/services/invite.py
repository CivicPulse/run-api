"""Invite business logic: create, validate, accept, revoke, list."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from loguru import logger
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import InsufficientPermissionsError
from app.core.security import CampaignRole
from app.models.campaign_member import CampaignMember
from app.models.invite import Invite

if TYPE_CHECKING:
    from app.core.security import AuthenticatedUser
    from app.services.zitadel import ZitadelService


INVITE_EXPIRY_DAYS = 7


class InviteService:
    """Invite lifecycle management."""

    async def create_invite(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        email: str,
        role: str,
        creator: AuthenticatedUser,
    ) -> Invite:
        """Create a campaign invite with role validation.

        Args:
            db: Async database session.
            campaign_id: The campaign to invite into.
            email: Email of the invitee.
            role: Role to grant upon acceptance.
            creator: The authenticated user creating the invite.

        Returns:
            The created Invite.

        Raises:
            InsufficientPermissionsError: If creator cannot invite at this role level.
            ValueError: If a pending invite already exists for this email+campaign.
        """
        # Validate role hierarchy: creator must be above the invited role
        invited_role = CampaignRole[role.upper()]
        if creator.role == CampaignRole.OWNER:
            # Owner can invite any role except owner
            if invited_role == CampaignRole.OWNER:
                raise InsufficientPermissionsError(
                    "Cannot invite with owner role"
                )
        elif creator.role == CampaignRole.ADMIN:
            # Admin can invite manager and below
            if invited_role > CampaignRole.MANAGER:
                raise InsufficientPermissionsError(
                    "Admins can only invite manager role and below"
                )
        else:
            raise InsufficientPermissionsError(
                "Only admins and owners can create invites"
            )

        # Check for existing pending invite
        result = await db.execute(
            select(Invite).where(
                and_(
                    Invite.campaign_id == campaign_id,
                    Invite.email == email.lower(),
                    Invite.accepted_at.is_(None),
                    Invite.revoked_at.is_(None),
                    Invite.expires_at > datetime.now(UTC),
                )
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            msg = f"A pending invite already exists for {email} in this campaign"
            raise ValueError(msg)

        now = datetime.now(UTC)
        invite = Invite(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            email=email.lower(),
            role=role.lower(),
            token=uuid.uuid4(),
            expires_at=now + timedelta(days=INVITE_EXPIRY_DAYS),
            created_by=creator.id,
            created_at=now,
        )
        db.add(invite)
        await db.commit()
        await db.refresh(invite)
        logger.info(
            "Invite created for {} to campaign {} with role {}",
            email,
            campaign_id,
            role,
        )
        return invite

    async def validate_invite(
        self,
        db: AsyncSession,
        token: uuid.UUID,
    ) -> Invite | None:
        """Validate an invite token.

        Args:
            db: Async database session.
            token: The invite token UUID.

        Returns:
            The Invite if valid, None otherwise.
        """
        result = await db.execute(
            select(Invite).where(Invite.token == token)
        )
        invite = result.scalar_one_or_none()
        if invite is None:
            return None
        if invite.expires_at < datetime.now(UTC):
            return None
        if invite.revoked_at is not None:
            return None
        if invite.accepted_at is not None:
            return None
        return invite

    async def accept_invite(
        self,
        db: AsyncSession,
        token: uuid.UUID,
        user: AuthenticatedUser,
        zitadel: ZitadelService,
    ) -> Invite:
        """Accept an invite: create member, assign ZITADEL role.

        Args:
            db: Async database session.
            token: The invite token UUID.
            user: The authenticated user accepting.
            zitadel: ZITADEL service for role assignment.

        Returns:
            The accepted Invite.

        Raises:
            ValueError: If invite is invalid or email doesn't match.
        """
        invite = await self.validate_invite(db, token)
        if invite is None:
            msg = "Invalid or expired invite"
            raise ValueError(msg)

        # Verify email match (case-insensitive)
        if user.email is None or user.email.lower() != invite.email.lower():
            msg = "Email does not match the invite"
            raise ValueError(msg)

        # Create or update CampaignMember
        member_result = await db.execute(
            select(CampaignMember).where(
                and_(
                    CampaignMember.user_id == user.id,
                    CampaignMember.campaign_id == invite.campaign_id,
                )
            )
        )
        member = member_result.scalar_one_or_none()
        if member is None:
            member = CampaignMember(
                user_id=user.id,
                campaign_id=invite.campaign_id,
            )
            db.add(member)

        # Assign ZITADEL project role
        await zitadel.assign_project_role(
            str(invite.campaign_id), user.id, invite.role
        )

        invite.accepted_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(invite)
        logger.info(
            "Invite accepted by {} for campaign {} with role {}",
            user.id,
            invite.campaign_id,
            invite.role,
        )
        return invite

    async def revoke_invite(
        self,
        db: AsyncSession,
        invite_id: uuid.UUID,
    ) -> Invite:
        """Revoke a pending invite.

        Args:
            db: Async database session.
            invite_id: The invite UUID.

        Returns:
            The revoked Invite.

        Raises:
            ValueError: If invite not found.
        """
        result = await db.execute(
            select(Invite).where(Invite.id == invite_id)
        )
        invite = result.scalar_one_or_none()
        if invite is None:
            msg = "Invite not found"
            raise ValueError(msg)

        invite.revoked_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(invite)
        return invite

    async def list_invites(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
    ) -> list[Invite]:
        """List pending invites for a campaign.

        Args:
            db: Async database session.
            campaign_id: The campaign UUID.

        Returns:
            List of pending (not accepted, not revoked, not expired) invites.
        """
        result = await db.execute(
            select(Invite).where(
                and_(
                    Invite.campaign_id == campaign_id,
                    Invite.accepted_at.is_(None),
                    Invite.revoked_at.is_(None),
                    Invite.expires_at > datetime.now(UTC),
                )
            )
        )
        return list(result.scalars().all())
